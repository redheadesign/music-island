// A native multiline editor used only by the dictation benchmark. No clipboard,
// keyboard hook or desktop-wide paste. The delivery subprocess addresses its peer.
#include <windows.h>
#include <algorithm>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <string>
#include <vector>
namespace fs = std::filesystem;
static constexpr UINT control = WM_APP + 37;
static constexpr ULONG_PTR envelope = 0x4d495145;
static fs::path folder, executable;
static std::wstring identity;
static HWND edit{};
static long long down = 0, release = 0, releaseReturned = 0, keyMessage = 0, change = 0;
static bool delivered = false;

static long long tick() {
    LARGE_INTEGER n;
    QueryPerformanceCounter(&n);
    return n.QuadPart;
}
static std::string utf8(const std::wstring &text) {
    int n = WideCharToMultiByte(CP_UTF8, 0, text.data(), int(text.size()), nullptr, 0, nullptr,
                                nullptr);
    std::string s(n, ' ');
    WideCharToMultiByte(CP_UTF8, 0, text.data(), int(text.size()), s.data(), n, nullptr, nullptr);
    return s;
}
static void record(const char *file, const std::string &value) {
    // Open with truncation only in the designated trial directory.
    std::ofstream out(folder / file, std::ios::binary);
    out << value;
}
static HWND peer() {
    HWND w = FindWindowW(identity.c_str(), identity.c_str());
    if (!w)
        return nullptr;
    DWORD pid = 0;
    GetWindowThreadProcessId(w, &pid);
    HANDLE process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid);
    if (!process)
        return nullptr;
    wchar_t image[32768];
    DWORD length = 32768;
    bool ok = QueryFullProcessImageNameW(process, 0, image, &length) != FALSE;
    CloseHandle(process);
    if (!ok || _wcsicmp(executable.c_str(), image) != 0)
        return nullptr;
    return w;
}
static bool key(HWND w, bool up) {
    if (GetForegroundWindow() != w || GetFocus() != edit)
        return false;
    INPUT input{};
    input.type = INPUT_KEYBOARD;
    input.ki.wVk = VK_F24;
    input.ki.dwFlags = up ? KEYEVENTF_KEYUP : 0;
    if (up)
        release = tick();
    else
        down = tick();
    bool ok = SendInput(1, &input, sizeof(input)) == 1;
    if (up)
        releaseReturned = tick();
    return ok;
}
static LRESULT CALLBACK editorMessage(HWND w, UINT message, WPARAM a, LPARAM b) {
    if (message == WM_CREATE) {
        edit = CreateWindowExW(WS_EX_CLIENTEDGE, L"EDIT", L"",
                               WS_CHILD | WS_VISIBLE | WS_TABSTOP | WS_VSCROLL | ES_LEFT |
                                   ES_MULTILINE | ES_AUTOVSCROLL,
                               0, 0, 100, 100, w, (HMENU)1, GetModuleHandleW(nullptr), nullptr);
        SendMessageW(edit, WM_SETFONT, (WPARAM)GetStockObject(DEFAULT_GUI_FONT), TRUE);
        return edit ? 0 : -1;
    }
    if (message == WM_SIZE) {
        MoveWindow(edit, 0, 0, LOWORD(b), HIWORD(b), TRUE);
        return 0;
    }
    if (message == WM_SETFOCUS) {
        SetFocus(edit);
        return 0;
    }
    if (message == control) {
        if (a == 1) {
            if (down && !release)
                return 0;
            delivered = false;
            release = 0;
            keyMessage = 0;
            change = 0;
            SetWindowTextW(edit, L"");
            ShowWindow(w, SW_RESTORE);
            SetForegroundWindow(w);
            SetFocus(edit);
            return key(w, false);
        }
        if (a == 2) {
            if (!down || release)
                return 0;
            if (GetForegroundWindow() != w) {
                SetForegroundWindow(w);
                SetFocus(edit);
            }
            return key(w, true);
        }
        if (a == 3) {
            PostMessageW(w, WM_CLOSE, 0, 0);
            return 1;
        }
        return 0;
    }
    if (message == WM_COPYDATA) {
        auto data = reinterpret_cast<const COPYDATASTRUCT *>(b);
        if (!release || delivered || !data || data->dwData != envelope || !data->lpData ||
            data->cbData < 4 || data->cbData > 16 * 1024 * 1024 || data->cbData % 2)
            return FALSE;
        const auto *text = static_cast<const wchar_t *>(data->lpData);
        if (text[data->cbData / 2 - 1] != 0)
            return FALSE;
        SendMessageW(edit, EM_SETSEL, 0, -1);
        SendMessageW(edit, EM_REPLACESEL, TRUE, (LPARAM)text);
        return delivered;
    }
    if (message == WM_COMMAND && HIWORD(a) == EN_CHANGE && (HWND)b == edit && release &&
        !delivered) {
        change = tick();
        int size = GetWindowTextLengthW(edit);
        if (!size)
            return 0;
        std::wstring text(size + 1, 0);
        GetWindowTextW(edit, text.data(), size + 1);
        text.resize(size);
        LARGE_INTEGER hz;
        QueryPerformanceFrequency(&hz);
        delivered = true;
        record("editor.txt", utf8(text));
        record("editor-metrics.json",
               "{\"frequency\":" + std::to_string(hz.QuadPart) + ",\"press\":" +
                   std::to_string(down) + ",\"release\":" + std::to_string(release) +
                   ",\"releaseReturned\":" + std::to_string(releaseReturned) + ",\"editorKeyUp\":" +
                   std::to_string(keyMessage) + ",\"enChange\":" + std::to_string(change) + "}");
        return 0;
    }
    if (message == WM_DESTROY) {
        PostQuitMessage(0);
        return 0;
    }
    return DefWindowProcW(w, message, a, b);
}
static int host(bool verifyDelivery = false) {
    WNDCLASSW cls{};
    cls.lpfnWndProc = editorMessage;
    cls.hInstance = GetModuleHandleW(nullptr);
    cls.hCursor = LoadCursor(nullptr, IDC_IBEAM);
    cls.lpszClassName = identity.c_str();
    if (!RegisterClassW(&cls))
        return 10;
    HWND w = CreateWindowExW(WS_EX_TOOLWINDOW, identity.c_str(), identity.c_str(),
                             WS_OVERLAPPEDWINDOW, CW_USEDEFAULT, CW_USEDEFAULT, 640, 220, nullptr,
                             nullptr, cls.hInstance, nullptr);
    if (!w)
        return 11;
    if (verifyDelivery) {
        // Exercise the exact multiline control and notification path without creating keyboard
        // events.
        release = tick();
        releaseReturned = release;
        std::wstring sample = L"Тест редактора";
        COPYDATASTRUCT note{envelope, DWORD((sample.size() + 1) * sizeof(wchar_t)), sample.data()};
        bool accepted = SendMessageW(w, WM_COPYDATA, 0, (LPARAM)&note) != 0;
        DestroyWindow(w);
        return accepted && change >= release ? 0 : 12;
    }
    ShowWindow(w, SW_SHOWNORMAL);
    SetForegroundWindow(w);
    SetFocus(edit);
    record("editor-ready", std::to_string(GetCurrentProcessId()));
    MSG msg;
    while (GetMessageW(&msg, nullptr, 0, 0) > 0) {
        if (msg.hwnd == edit && msg.message == WM_KEYUP && msg.wParam == VK_F24)
            keyMessage = tick();
        TranslateMessage(&msg);
        DispatchMessageW(&msg);
    }
    return 0;
}
int wmain(int argc, wchar_t **argv) {
    wchar_t dir[32768]{}, nonce[64]{}, module[32768]{};
    auto d = GetEnvironmentVariableW(L"MUSIC_ISLAND_EDITOR_RUN", dir, 32768),
         n = GetEnvironmentVariableW(L"MUSIC_ISLAND_EDITOR_NONCE", nonce, 64);
    if (!d || d >= 32768 || n != 32 ||
        std::wstring(nonce).find_first_not_of(L"0123456789abcdef") != std::wstring::npos ||
        !GetModuleFileNameW(nullptr, module, 32768))
        return 2;
    folder = dir;
    executable = module;
    identity = L"MusicIsland.Dictation.Bench." + std::wstring(nonce);
    if (argc == 3 && std::wstring(argv[1]) == L"--bench") {
        std::wstring op = argv[2];
        if (op == L"host")
            return host();
        if (op == L"verify-delivery")
            return host(true);
        auto target = peer();
        if (!target)
            return 3;
        auto command = op == L"press" ? 1 : op == L"release" ? 2 : op == L"close" ? 3 : 0;
        if (!command)
            return 2;
        DWORD pid = 0;
        GetWindowThreadProcessId(target, &pid);
        AllowSetForegroundWindow(pid);
        DWORD_PTR result = 0;
        return SendMessageTimeoutW(target, control, command, 0, SMTO_ABORTIFHUNG | SMTO_BLOCK, 3000,
                                   &result) &&
                       result
                   ? 0
                   : 4;
    }
    if (argc != 2)
        return 2;
    auto target = peer();
    if (!target)
        return 3;
    std::wstring text = argv[1];
    COPYDATASTRUCT data{envelope, DWORD((text.size() + 1) * sizeof(wchar_t)), text.data()};
    DWORD_PTR result = 0;
    return SendMessageTimeoutW(target, WM_COPYDATA, 0, (LPARAM)&data, SMTO_ABORTIFHUNG | SMTO_BLOCK,
                               4500, &result) &&
                   result
               ? 0
               : 5;
}
