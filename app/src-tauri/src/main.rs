// input: plandeck_lib
// output: 进程启动
// position: 二进制入口（仅调用 lib::run）
// 维护：一旦我被更新，务必更新我的开头注释，以及所属文件夹的 FOLDER.md。

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    plandeck_lib::run()
}
