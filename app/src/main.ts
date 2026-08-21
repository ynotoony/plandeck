// input: App.svelte + theme + styles.css
// output: 挂载到 #app 的 Svelte 应用
// position: 前端入口（index.html 引用）
// 维护：一旦我被更新，务必更新我的开头注释，以及所属文件夹的 FOLDER.md。

import { mount } from "svelte";
import App from "./App.svelte";
import { applyTheme, themeState } from "./lib/theme.svelte";
import "./styles.css";

applyTheme(themeState.selected);
const app = mount(App, { target: document.getElementById("app")! });

export default app;
