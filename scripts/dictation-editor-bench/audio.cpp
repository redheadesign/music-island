// Render a PCM16 mono fixture exclusively to an explicitly named VB-Audio endpoint.
// Enumeration reads properties only. This executable never creates a capture client.
#include <windows.h>
#include <audioclient.h>
#include <audiopolicy.h>
#include <mmdeviceapi.h>
#include <initguid.h>
#include <propkeydef.h>
#include <functiondiscoverykeys_devpkey.h>
#include <wrl/client.h>
#include <algorithm>
#include <chrono>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <memory>
#include <sstream>
#include <stdexcept>
#include <vector>
using Microsoft::WRL::ComPtr;

static void check(HRESULT hr) {
    if (FAILED(hr)) {
        std::ostringstream msg;
        msg << "Windows audio error 0x" << std::hex << unsigned(hr);
        throw std::runtime_error(msg.str());
    }
}
static std::wstring prop(IPropertyStore *store, REFPROPERTYKEY key) {
    PROPVARIANT v{};
    check(store->GetValue(key, &v));
    std::wstring result;
    if (v.vt == VT_LPWSTR && v.pwszVal)
        result = v.pwszVal;
    if (v.vt == VT_CLSID && v.puuid) {
        wchar_t s[40]{};
        StringFromGUID2(*v.puuid, s, 40);
        result = s;
    }
    PropVariantClear(&v);
    return result;
}
static std::string utf8(const std::wstring &w) {
    int size =
        WideCharToMultiByte(CP_UTF8, 0, w.c_str(), int(w.size()), nullptr, 0, nullptr, nullptr);
    std::string s(size, ' ');
    WideCharToMultiByte(CP_UTF8, 0, w.c_str(), int(w.size()), s.data(), size, nullptr, nullptr);
    return s;
}
static bool cable(const std::wstring &s) {
    auto lower = s;
    std::transform(lower.begin(), lower.end(), lower.begin(), towlower);
    return lower.find(L"cable") != s.npos && lower.find(L"vb-audio") != s.npos;
}
struct Endpoint {
    std::wstring id, name, container;
    EDataFlow flow;
    ComPtr<IMMDevice> device;
};
static std::vector<Endpoint> endpoints() {
    ComPtr<IMMDeviceEnumerator> manager;
    check(CoCreateInstance(__uuidof(MMDeviceEnumerator), nullptr, CLSCTX_ALL,
                           IID_PPV_ARGS(&manager)));
    std::vector<Endpoint> result;
    for (auto flow : {eRender, eCapture}) {
        ComPtr<IMMDeviceCollection> items;
        check(manager->EnumAudioEndpoints(flow, DEVICE_STATE_ACTIVE, &items));
        UINT size;
        check(items->GetCount(&size));
        for (UINT i = 0; i < size; i++) {
            ComPtr<IMMDevice> device;
            check(items->Item(i, &device));
            ComPtr<IPropertyStore> store;
            check(device->OpenPropertyStore(STGM_READ, &store));
            auto name = prop(store.Get(), PKEY_Device_FriendlyName);
            if (!cable(name))
                continue;
            LPWSTR raw = nullptr;
            check(device->GetId(&raw));
            result.push_back({raw, name, prop(store.Get(), PKEY_Device_ContainerId), flow, device});
            CoTaskMemFree(raw);
        }
    }
    return result;
}
static void requireUnusedCable(const std::vector<Endpoint> &devices, const Endpoint &target) {
    const auto familyStart = target.name.find(L'(');
    if (familyStart == std::wstring::npos) {
        throw std::runtime_error("Unrecognized virtual cable name");
    }
    const auto family = target.name.substr(familyStart);
    for (const auto &device : devices) {
        if (device.flow != eRender || device.name.find(family) == std::wstring::npos)
            continue;
        ComPtr<IAudioSessionManager2> manager;
        check(device.device->Activate(__uuidof(IAudioSessionManager2), CLSCTX_ALL, nullptr,
                                      (void **)manager.GetAddressOf()));
        ComPtr<IAudioSessionEnumerator> sessions;
        check(manager->GetSessionEnumerator(&sessions));
        int total = 0;
        check(sessions->GetCount(&total));
        for (int index = 0; index < total; ++index) {
            ComPtr<IAudioSessionControl> session;
            AudioSessionState state;
            check(sessions->GetSession(index, &session));
            check(session->GetState(&state));
            if (state == AudioSessionStateActive)
                throw std::runtime_error("Virtual test cable already has an active render stream");
        }
    }
}
static uint32_t word32(const unsigned char *p) {
    return p[0] | (uint32_t(p[1]) << 8) | (uint32_t(p[2]) << 16) | (uint32_t(p[3]) << 24);
}
static std::vector<unsigned char> readWav(const std::filesystem::path &file) {
    std::ifstream in(file, std::ios::binary | std::ios::ate);
    if (!in || in.tellg() < 44 || in.tellg() > 512 * 1024 * 1024)
        throw std::runtime_error("Invalid WAV size");
    std::vector<unsigned char> wav(size_t(in.tellg()));
    in.seekg(0);
    in.read(reinterpret_cast<char *>(wav.data()), wav.size());
    if (!in || memcmp(wav.data(), "RIFF", 4) || memcmp(wav.data() + 8, "WAVE", 4))
        throw std::runtime_error("Invalid WAV header");
    bool format = false;
    for (size_t i = 12; i + 8 <= wav.size();) {
        const uint32_t length = word32(wav.data() + i + 4);
        auto p = wav.data() + i + 8;
        if (length > wav.size() - i - 8)
            throw std::runtime_error("Incomplete WAV");
        if (!memcmp(wav.data() + i, "fmt ", 4) && length >= 16)
            format = word32(p) == 0x10001 && word32(p + 4) == 16000 && word32(p + 12) == 0x100002;
        if (!memcmp(wav.data() + i, "data", 4) && format && length && length % 2 == 0)
            return {p, p + length};
        i += 8 + length + (length & 1);
    }
    throw std::runtime_error("Expected uncompressed mono PCM16 at 16 kHz");
}
static void render(Endpoint &dest, const std::filesystem::path &wav) {
    const auto pcm = readWav(wav);
    ComPtr<IAudioClient> audio;
    check(dest.device->Activate(__uuidof(IAudioClient), CLSCTX_ALL, nullptr,
                                (void **)audio.GetAddressOf()));
    WAVEFORMATEX fmt{WAVE_FORMAT_PCM, 1, 16000, 32000, 2, 16, 0};
    check(audio->Initialize(AUDCLNT_SHAREMODE_SHARED,
                            AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM |
                                AUDCLNT_STREAMFLAGS_SRC_DEFAULT_QUALITY,
                            0, 0, &fmt, nullptr));
    ComPtr<IAudioRenderClient> stream;
    check(audio->GetService(IID_PPV_ARGS(&stream)));
    UINT32 capacity;
    check(audio->GetBufferSize(&capacity));
    const size_t frames = pcm.size() / 2;
    size_t sent = 0;
    const auto deadline =
        std::chrono::steady_clock::now() + std::chrono::seconds(frames / 16000 + 12);
    check(audio->Start());
    while (true) {
        if (std::chrono::steady_clock::now() > deadline)
            throw std::runtime_error("Virtual render timed out");
        UINT32 buffered;
        check(audio->GetCurrentPadding(&buffered));
        if (sent == frames && !buffered)
            break;
        UINT32 n = UINT32(std::min<size_t>(capacity - buffered, frames - sent));
        if (n) {
            BYTE *block;
            check(stream->GetBuffer(n, &block));
            memcpy(block, pcm.data() + sent * 2, n * 2);
            check(stream->ReleaseBuffer(n, 0));
            sent += n;
        }
        Sleep(2);
    }
    check(audio->Stop());
}
int wmain(int argc, wchar_t **argv) {
    try {
        check(CoInitializeEx(nullptr, COINIT_MULTITHREADED));
        auto items = endpoints();
        if (argc == 2 && std::wstring(argv[1]) == L"list") {
            for (auto &e : items)
                std::cout << (e.flow == eCapture ? "capture" : "render") << '\t' << utf8(e.id)
                          << '\t' << utf8(e.name) << '\t' << utf8(e.container) << "\n";
        } else if ((argc == 4 && std::wstring(argv[1]) == L"render") ||
                   (argc == 3 && std::wstring(argv[1]) == L"idle")) {
            auto dest = std::find_if(items.begin(), items.end(),
                                     [&](auto &e) { return e.flow == eRender && e.id == argv[2]; });
            if (dest == items.end())
                throw std::runtime_error(
                    "Requested active VB-Audio render endpoint is unavailable");
            requireUnusedCable(items, *dest);
            if (argc == 4)
                render(*dest, argv[3]);
        } else
            throw std::runtime_error("Use list or render <exact VB-Audio endpoint ID> <WAV>");
        return 0;
    } catch (const std::exception &e) {
        std::cerr << e.what() << '\n';
        return 1;
    }
}
