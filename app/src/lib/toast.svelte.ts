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
