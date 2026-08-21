// input: 无
// output: toastState + toast() 定时消失
// position: 全局提示
// 维护：一旦我被更新，务必更新我的开头注释，以及所属文件夹的 FOLDER.md。

interface ToastState {
  msg: string;
  kind: "ok" | "err";
  visible: boolean;
}

export const toastState = $state<ToastState>({ msg: "", kind: "ok", visible: false });

let timer: ReturnType<typeof setTimeout> | undefined;

export function toast(msg: string, kind: "ok" | "err" = "ok"): void {
  toastState.msg = msg;
  toastState.kind = kind;
  toastState.visible = true;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    toastState.visible = false;
  }, 3200);
}
