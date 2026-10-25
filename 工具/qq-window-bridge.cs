using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Runtime.InteropServices;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Automation;

// Local application helper: UI Automation only, no QQ injection, protocol, clipboard, or account database access.
class QqWindowBridge {
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h,IntPtr pid);
  [DllImport("user32.dll")] static extern bool AttachThreadInput(uint from,uint to,bool attach);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] static extern uint SendInput(uint count, INPUT[] input, int size);
  [StructLayout(LayoutKind.Sequential)] struct INPUT { public uint type; public UNION u; }
  [StructLayout(LayoutKind.Explicit)] struct UNION { [FieldOffset(0)] public MOUSE mouse; [FieldOffset(0)] public KEY key; }
  [StructLayout(LayoutKind.Sequential)] struct MOUSE { public int x,y; public uint data,flags,time; public IntPtr extra; }
  [StructLayout(LayoutKind.Sequential)] struct KEY { public ushort vk,scan; public uint flags,time; public IntPtr extra; }
  static JavaScriptSerializer json=new JavaScriptSerializer();
  static TreeWalker walk=TreeWalker.ControlViewWalker;
  static string Name(AutomationElement e){return e==null?"":e.Current.Name??"";}
  static List<AutomationElement> Children(AutomationElement e){var a=new List<AutomationElement>();for(var c=walk.GetFirstChild(e);c!=null;c=walk.GetNextSibling(c))a.Add(c);return a;}
  static List<AutomationElement> All(AutomationElement e){return e.FindAll(TreeScope.Descendants,Condition.TrueCondition).Cast<AutomationElement>().Take(5000).ToList();}
  static string Text(AutomationElement e){object p;if(e.TryGetCurrentPattern(ValuePattern.Pattern,out p))return ((ValuePattern)p).Current.Value; if(e.TryGetCurrentPattern(TextPattern.Pattern,out p))return ((TextPattern)p).DocumentRange.GetText(-1).TrimEnd('\r','\n');return String.Join("",All(e).Where(x=>x.Current.ControlType==ControlType.Text).Select(Name).ToArray());}
  static string Get(Dictionary<string,object> q,string key){return q.ContainsKey(key)?Convert.ToString(q[key]):"";}
  static bool IsQq(AutomationElement e){try{return String.Equals(System.IO.Path.GetFileName(Process.GetProcessById(e.Current.ProcessId).MainModule.FileName),"QQ.exe",StringComparison.OrdinalIgnoreCase);}catch{return false;}}
  static Condition Named(ControlType type,string name){return new AndCondition(new PropertyCondition(AutomationElement.ControlTypeProperty,type),new PropertyCondition(AutomationElement.NameProperty,name));}
  static AutomationElement Input(AutomationElement window,string group){var a=window.FindAll(TreeScope.Descendants,Named(ControlType.Group,group)).Cast<AutomationElement>().ToList();if(a.Count!=1)throw new Exception("未找到唯一的群输入区域，请打开QQ效率模式和指定群。");return a[0];}
  static AutomationElement Messages(AutomationElement window){var a=window.FindAll(TreeScope.Descendants,new PropertyCondition(AutomationElement.AutomationIdProperty,"ml-root")).Cast<AutomationElement>().ToList();if(a.Count!=1)throw new Exception("没有可读取的群消息区，请打开目标群。");return a[0];}
  static void Check(AutomationElement window,string group){if(IsIconic(new IntPtr(window.Current.NativeWindowHandle)))throw new Exception("QQ窗口已最小化，请还原目标群窗口；被遮挡不影响读取。");if(!IsQq(window))throw new Exception("目标不是QQ窗口。");if(window.FindFirst(TreeScope.Descendants,Named(ControlType.Button,group))==null)throw new Exception("当前会话不是绑定群，已暂停。");Messages(window);Input(window,group);}
  static void Activate(AutomationElement window){
    var h=new IntPtr(window.Current.NativeWindowHandle);if(GetForegroundWindow()==h)return;
    var current=GetCurrentThreadId();var foregroundThread=GetWindowThreadProcessId(GetForegroundWindow(),IntPtr.Zero);bool attached=false;
    try{if(foregroundThread!=0&&foregroundThread!=current)attached=AttachThreadInput(current,foregroundThread,true);SetForegroundWindow(h);try{window.SetFocus();}catch{}Thread.Sleep(120);}
    finally{if(attached)AttachThreadInput(current,foregroundThread,false);}
    if(GetForegroundWindow()!=h){
      // A brief Alt cycle releases Windows' foreground lock for this explicit switch.
      // Never type the reply unless the target HWND is subsequently confirmed.
      var alt=new INPUT[]{new INPUT{type=1,u=new UNION{key=new KEY{vk=0x12,flags=0}}},new INPUT{type=1,u=new UNION{key=new KEY{vk=0x12,flags=2}}}};
      if(SendInput(2,alt,Marshal.SizeOf(typeof(INPUT)))==2){SetForegroundWindow(h);Thread.Sleep(150);}
    }
    if(GetForegroundWindow()!=h)throw new Exception("Windows未允许激活QQ窗口，未输入或发送；请手动切回目标群。");
  }
  static object Snapshot(AutomationElement window,string group){
    Check(window,group);var root=Messages(window);var rows=new List<object>();var pane=root.Current.BoundingRectangle;
    foreach(var row in Children(root).Where(x=>x.Current.ControlType==ControlType.Group)){
      var blocks=Children(row);if(blocks.Count==0)continue;var body=blocks.Last();var fields=Children(body);if(fields.Count<2)continue;
      var sender=fields.FirstOrDefault(x=>x.Current.ControlType==ControlType.Group&&!String.IsNullOrWhiteSpace(Name(x)));var content=fields.Last();if(sender==null||content==sender)continue;
      var text=Text(content);if(text.Length==0)text="[非文字消息未读取]";if(text.Length>2000)text=text.Substring(0,2000);
      var box=sender.Current.BoundingRectangle;bool own=!box.IsEmpty&&box.Width>0&&box.Left>pane.Left+pane.Width*0.55;
      rows.Add(new {key=String.Join("-",row.GetRuntimeId().Select(v=>v.ToString()).ToArray()),sender=Name(sender),text=text,own=own});
    }
    var input=Input(window,group);bool muted=All(input).Any(e=>Name(e).Contains("禁言"));
    return new {handle=window.Current.NativeWindowHandle.ToString(),pid=window.Current.ProcessId,group=group,messages=rows.TakeLastCompat(50).ToArray(),foreground=GetForegroundWindow()==new IntPtr(window.Current.NativeWindowHandle),muted=muted,draft=Text(input)};
  }
  static AutomationElement Bound(Dictionary<string,object> q){long h;if(!Int64.TryParse(Get(q,"handle"),out h))throw new Exception("请先绑定QQ群窗口。");var w=AutomationElement.FromHandle(new IntPtr(h));if(!IsQq(w))throw new Exception("QQ窗口已关闭，请重新绑定。");var proc=Process.GetProcessById(w.Current.ProcessId);if(proc.Id.ToString()!=Get(q,"pid")||proc.StartTime.ToUniversalTime().Ticks.ToString()!=Get(q,"started")||!String.Equals(proc.MainModule.FileName,Get(q,"exe"),StringComparison.OrdinalIgnoreCase))throw new Exception("QQ进程已变化，请重新绑定。");return w;}
  static object Execute(Dictionary<string,object> q){
    string action=Get(q,"action"),group=Get(q,"group").Trim();if(group.Length<1||group.Length>100)throw new Exception("请填写目标群的完整群名。");
    if(action=="bind"){
      var windows=AutomationElement.RootElement.FindAll(TreeScope.Children,Condition.TrueCondition).Cast<AutomationElement>().Where(IsQq).Where(candidate=>!IsIconic(new IntPtr(candidate.Current.NativeWindowHandle))).Where(candidate=>candidate.FindFirst(TreeScope.Descendants,Named(ControlType.Button,group))!=null).ToList();
      if(windows.Count!=1)throw new Exception("请在官方QQ打开目标群，只保留一个匹配群名的聊天窗口，再重新绑定。");var w=windows[0];Check(w,group);var p=Process.GetProcessById(w.Current.ProcessId);return new {handle=w.Current.NativeWindowHandle.ToString(),pid=p.Id.ToString(),started=p.StartTime.ToUniversalTime().Ticks.ToString(),exe=p.MainModule.FileName,group=group,snapshot=Snapshot(w,group)};
    }
    var window=Bound(q);Check(window,group);
    if(action=="activate"){Activate(window);return new {activated=true};}
    if(action=="snapshot")return Snapshot(window,group);
    if(action!="send")throw new Exception("不支持的窗口操作。");
    string text=Get(q,"text");if(text.Any(c=>Char.IsControl(c)))throw new Exception("回复包含控制字符，未发送。");if(text.Length==0||text.Length>2000||text.Contains("\r")||text.Contains("\n"))throw new Exception("窗口模式只发送一段文字，最多2000个UTF-16单元。");
    var input=Input(window,group);
    if(All(input).Any(e=>Name(e).Contains("禁言")))throw new Exception("本群禁言中，未发送。");if(Text(input).Trim().Length!=0)throw new Exception("输入框存在草稿，未发送或覆盖。");
    Activate(window);Check(window,group);if(Text(Input(window,group)).Trim().Length!=0)throw new Exception("切回QQ后出现草稿，未发送。");input=Input(window,group);input.SetFocus();Thread.Sleep(80);Check(window,group);if(GetForegroundWindow()!=new IntPtr(window.Current.NativeWindowHandle))throw new Exception("窗口焦点变化，未发送。");
    var focus=AutomationElement.FocusedElement;bool inside=Automation.Compare(input,focus);for(var e=focus;!inside&&e!=null;e=walk.GetParent(e))inside=Automation.Compare(input,e);if(!inside)throw new Exception("无法确认输入焦点，未发送。");
    var keys=new List<INPUT>();foreach(char c in text){keys.Add(new INPUT{type=1,u=new UNION{key=new KEY{scan=c,flags=4}}});keys.Add(new INPUT{type=1,u=new UNION{key=new KEY{scan=c,flags=6}}});}
    if(SendInput((uint)keys.Count,keys.ToArray(),Marshal.SizeOf(typeof(INPUT)))!=keys.Count)throw new Exception("输入结果未知，请查看QQ草稿；不会自动重试。");Thread.Sleep(120);
    Check(window,group);if(GetForegroundWindow()!=new IntPtr(window.Current.NativeWindowHandle)||Text(Input(window,group))!=text)throw new Exception("草稿或窗口变化，未点击发送；不会自动重试。");
    var send=All(window).Where(e=>e.Current.ControlType==ControlType.Button&&Name(e)=="发送"&&e.Current.IsEnabled).ToList();object invoke;if(send.Count!=1||!send[0].TryGetCurrentPattern(InvokePattern.Pattern,out invoke))throw new Exception("发送按钮不可用，文字保留在草稿。");((InvokePattern)invoke).Invoke();return new {submitted=true};
  }
  [STAThread] static void Main(){Console.InputEncoding=new System.Text.UTF8Encoding(false);Console.OutputEncoding=new System.Text.UTF8Encoding(false);try{var q=json.Deserialize<Dictionary<string,object>>(Console.In.ReadToEnd());Console.WriteLine(json.Serialize(new{ok=true,data=Execute(q)}));}catch(Exception e){try{System.IO.File.WriteAllText(System.IO.Path.GetFullPath(System.IO.Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"../../数据/qq/window/last-error.txt")),DateTime.Now.ToString("s")+" "+e.Message);}catch{}Console.WriteLine(json.Serialize(new{ok=false,error=e.Message}));}}
}
static class Compat {public static IEnumerable<T> TakeLastCompat<T>(this IEnumerable<T> a,int n){var list=a.ToList();return list.Skip(Math.Max(0,list.Count-n));}}
