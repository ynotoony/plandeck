import { mount } from "svelte";
import App from "./App.svelte";
import { applyTheme, themeState } from "./lib/theme.svelte";
import "./styles.css";

applyTheme(themeState.selected);
const app = mount(App, { target: document.getElementById("app")! });

export default app;
