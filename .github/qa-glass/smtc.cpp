#include <windows.h>
#include <shobjidl.h>
#include <SystemMediaTransportControlsInterop.h>
#include <winrt/base.h>
#include <winrt/Windows.Foundation.h>
#include <winrt/Windows.Media.h>
#include <chrono>
#include <fstream>
#include <mutex>
#include <string>
#include <atomic>

using namespace winrt;
using namespace Windows::Media;
using namespace std::chrono_literals;
std::mutex writes;
std::atomic<long long> positionMs{12000};
void record_event(const std::string& name){
 std::lock_guard guard(writes);
 std::ofstream f("fixture-events.txt",std::ios::app); f << name << "\n";
}
void timeline(const SystemMediaTransportControls& controls) {
 SystemMediaTransportControlsTimelineProperties line;
 line.StartTime(0s);line.MinSeekTime(0s);line.EndTime(120s);line.MaxSeekTime(120s);
 line.Position(std::chrono::milliseconds(positionMs.load()));controls.UpdateTimelineProperties(line);
}
int wmain(int argc,wchar_t** argv) {
 if(argc!=2)return 2;
 std::wstring nonce(argv[1]);
 if(nonce.size()!=12||nonce.find_first_not_of(L"0123456789abcdef")!=std::wstring::npos)return 3;
 try {
  init_apartment(apartment_type::single_threaded);
  check_hresult(SetCurrentProcessExplicitAppUserModelID((L"MusicIsland.QA."+nonce).c_str()));
  auto hwnd=CreateWindowExW(WS_EX_TOOLWINDOW,L"STATIC",L"Music Island QA fixture",WS_POPUP,0,0,100,32,nullptr,nullptr,GetModuleHandleW(nullptr),nullptr);
  if(!hwnd)return 4;
  auto factory=get_activation_factory<SystemMediaTransportControls,ISystemMediaTransportControlsInterop>();
  SystemMediaTransportControls controls{nullptr};
  check_hresult(factory->GetForWindow(hwnd,guid_of<SystemMediaTransportControls>(),put_abi(controls)));
  controls.IsPauseEnabled(true);controls.IsPlayEnabled(true);controls.IsEnabled(true);
  auto updater=controls.DisplayUpdater();
  updater.Type(MediaPlaybackType::Music);
  updater.MusicProperties().Title(L"Island QA "+nonce);
  updater.MusicProperties().Artist(L"Native fixture");
  updater.Update();
  controls.PlaybackStatus(MediaPlaybackStatus::Playing);timeline(controls);
  auto buttons=controls.ButtonPressed([](const SystemMediaTransportControls& sender,const SystemMediaTransportControlsButtonPressedEventArgs& e){
   if(e.Button()==SystemMediaTransportControlsButton::Play){sender.PlaybackStatus(MediaPlaybackStatus::Playing);timeline(sender);record_event("play");}
   if(e.Button()==SystemMediaTransportControlsButton::Pause){sender.PlaybackStatus(MediaPlaybackStatus::Paused);timeline(sender);record_event("pause");}
  });
  auto seek=controls.PlaybackPositionChangeRequested([](const SystemMediaTransportControls& sender,const PlaybackPositionChangeRequestedEventArgs& e){
   positionMs.store(std::chrono::duration_cast<std::chrono::milliseconds>(e.RequestedPlaybackPosition()).count());
   timeline(sender);record_event("seek "+std::to_string(positionMs.load()));
  });
  record_event("ready");
  auto stopAt=std::chrono::steady_clock::now()+180s;
  while(std::chrono::steady_clock::now()<stopAt && GetFileAttributesW(L"fixture-stop") == INVALID_FILE_ATTRIBUTES){
   if(DeleteFileW(L"fixture-pause")) { controls.PlaybackStatus(MediaPlaybackStatus::Paused);timeline(controls); }
   MSG msg;while(PeekMessageW(&msg,nullptr,0,0,PM_REMOVE)){TranslateMessage(&msg);DispatchMessageW(&msg);} Sleep(40);
  }
  controls.ButtonPressed(buttons);controls.PlaybackPositionChangeRequested(seek);controls.IsEnabled(false);DestroyWindow(hwnd);return 0;
 }catch(const hresult_error& e){record_event("error "+std::to_string(e.code().value));return 5;}
}
