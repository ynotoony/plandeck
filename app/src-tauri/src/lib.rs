mod fsx;

use std::fmt::Write as _;
use std::path::Path;
use std::time::UNIX_EPOCH;

use rusqlite::{
    params_from_iter,
    types::{Value, ValueRef},
    Connection, OpenFlags,
};
use serde::Deserialize;
use serde::Serialize;
use sha2::{Digest, Sha256};
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{image::Image, tray::TrayIconBuilder, AppHandle, Emitter, Manager};
use tauri_plugin_updater::UpdaterExt;

pub struct AppState {
    pub home_dir: String,
    pub data_dir: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TrayMenuItem {
    id: String,
    label: String,
    enabled: bool,
    checked: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TrayToolMenu {
    tool_id: String,
    label: String,
    plans: Vec<TrayPlanMenu>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TrayPlanMenu {
    id: String,
    label: String,
    enabled: bool,
    items: Vec<TrayMenuItem>,
}

fn env_or(key: &str, fallback: impl FnOnce() -> Result<String, String>) -> Result<String, String> {
    match std::env::var(key) {
        Ok(v) if !v.is_empty() => Ok(v),
        _ => fallback(),
    }
}

#[tauri::command]
fn fs_exists(path: String) -> bool {
    Path::new(&path).exists()
}

#[tauri::command]
fn fs_read(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("读取失败 {path}: {e}"))
}

#[tauri::command]
fn fs_write(path: String, text: String, mode: Option<u32>) -> Result<(), String> {
    fsx::atomic_write(Path::new(&path), &text, mode)
}

#[tauri::command]
fn fs_list(path: String) -> Vec<String> {
    std::fs::read_dir(path)
        .map(|entries| {
            entries
                .filter_map(Result::ok)
                .map(|entry| entry.file_name().to_string_lossy().into_owned())
                .collect()
        })
        .unwrap_or_default()
}

#[tauri::command]
fn fs_is_directory(path: String) -> bool {
    Path::new(&path).is_dir()
}

#[tauri::command]
fn fs_mtime(path: String) -> Option<f64> {
    std::fs::metadata(path)
        .ok()?
        .modified()
        .ok()?
        .duration_since(UNIX_EPOCH)
        .ok()
        .map(|duration| duration.as_secs_f64() * 1000.0)
}

fn json_to_sql(value: serde_json::Value) -> Value {
    match value {
        serde_json::Value::Null => Value::Null,
        serde_json::Value::Number(number) => number
            .as_i64()
            .map(Value::Integer)
            .or_else(|| number.as_f64().map(Value::Real))
            .unwrap_or(Value::Null),
        serde_json::Value::String(value) => Value::Text(value),
        value => Value::Text(value.to_string()),
    }
}

fn sql_to_json(value: ValueRef<'_>) -> serde_json::Value {
    match value {
        ValueRef::Null => serde_json::Value::Null,
        ValueRef::Integer(value) => value.into(),
        ValueRef::Real(value) => serde_json::json!(value),
        ValueRef::Text(value) => String::from_utf8_lossy(value).into_owned().into(),
        ValueRef::Blob(value) => {
            serde_json::Value::Array(value.iter().map(|byte| (*byte).into()).collect())
        }
    }
}

#[tauri::command]
fn sqlite_query(
    path: String,
    sql: String,
    params: Vec<serde_json::Value>,
) -> Result<Vec<serde_json::Map<String, serde_json::Value>>, String> {
    if !Path::new(&path).exists() {
        return Ok(Vec::new());
    }
    let connection = Connection::open_with_flags(&path, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|error| format!("打开 SQLite 失败 {path}: {error}"))?;
    connection
        .busy_timeout(std::time::Duration::from_secs(2))
        .map_err(|error| error.to_string())?;
    let mut statement = connection
        .prepare(&sql)
        .map_err(|error| error.to_string())?;
    let names: Vec<String> = statement
        .column_names()
        .iter()
        .map(|name| (*name).to_owned())
        .collect();
    let values: Vec<Value> = params.into_iter().map(json_to_sql).collect();
    let rows = statement
        .query_map(params_from_iter(values), |row| {
            let mut object = serde_json::Map::new();
            for (index, name) in names.iter().enumerate() {
                object.insert(name.clone(), sql_to_json(row.get_ref(index)?));
            }
            Ok(object)
        })
        .map_err(|error| error.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn backup_files(
    state: tauri::State<AppState>,
    tool_id: String,
    paths: Vec<String>,
) -> Result<Vec<String>, String> {
    let saved = fsx::backup_files(Path::new(&state.data_dir), &tool_id, &paths)?;
    Ok(saved
        .iter()
        .map(|p| p.to_string_lossy().into_owned())
        .collect())
}

#[tauri::command]
fn list_backups(
    state: tauri::State<AppState>,
    targets: Vec<fsx::BackupTarget>,
) -> Result<Vec<fsx::BackupRecord>, String> {
    fsx::list_backups(Path::new(&state.data_dir), &targets)
}

#[tauri::command]
fn restore_backup(
    state: tauri::State<AppState>,
    targets: Vec<fsx::BackupTarget>,
    id: String,
) -> Result<Vec<String>, String> {
    Ok(
        fsx::restore_backup(Path::new(&state.data_dir), &targets, &id)?
            .iter()
            .map(|p| p.to_string_lossy().into_owned())
            .collect(),
    )
}

#[tauri::command]
fn open_in_editor(path: String) -> Result<(), String> {
    if !Path::new(&path).exists() {
        return Err(format!("文件不存在: {path}"));
    }
    std::process::Command::new("open")
        .arg("-t")
        .arg(&path)
        .spawn()
        .map_err(|e| format!("打开失败 {path}: {e}"))?;
    Ok(())
}

#[tauri::command]
fn home_dir(state: tauri::State<AppState>) -> String {
    state.home_dir.clone()
}

#[tauri::command]
fn data_dir(state: tauri::State<AppState>) -> String {
    state.data_dir.clone()
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct EnvPlan {
    id: String,
    name: String,
    source: String,
    source_detail: String,
    credential_fingerprint: String,
    models: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PlanTestResult {
    status: String,
    message: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct UpdateInfo {
    version: String,
    date: Option<String>,
    body: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct UpdateCheckResult {
    current_version: String,
    update: Option<UpdateInfo>,
}

#[derive(Debug, Deserialize)]
struct GithubRelease {
    tag_name: String,
    name: Option<String>,
    body: Option<String>,
    published_at: Option<String>,
    prerelease: bool,
    draft: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ReleaseHistoryItem {
    version: String,
    name: String,
    body: Option<String>,
    published_at: Option<String>,
    prerelease: bool,
}

#[tauri::command]
fn app_version(app: AppHandle) -> String {
    app.package_info().version.to_string()
}

#[tauri::command]
async fn check_for_update(app: AppHandle) -> Result<UpdateCheckResult, String> {
    let current_version = app.package_info().version.to_string();
    let update = app
        .updater()
        .map_err(|error| format!("无法初始化更新器: {error}"))?
        .check()
        .await
        .map_err(|error| format!("检查更新失败: {error}"))?
        .map(|update| UpdateInfo {
            version: update.version,
            date: update.date.map(|date| date.to_string()),
            body: update.body,
        });
    Ok(UpdateCheckResult {
        current_version,
        update,
    })
}

fn release_history_item(release: GithubRelease) -> Option<ReleaseHistoryItem> {
    if release.draft || release.tag_name == "updater" {
        return None;
    }
    let name = release
        .name
        .filter(|name| !name.trim().is_empty())
        .unwrap_or_else(|| release.tag_name.clone());
    Some(ReleaseHistoryItem {
        version: release.tag_name,
        name,
        body: release.body,
        published_at: release.published_at,
        prerelease: release.prerelease,
    })
}

#[tauri::command]
async fn release_history() -> Result<Vec<ReleaseHistoryItem>, String> {
    let releases = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .user_agent("PlanDeck update history")
        .build()
        .map_err(|error| format!("无法初始化更新记录请求: {error}"))?
        .get("https://api.github.com/repos/ynotoony/plandeck/releases?per_page=10")
        .header(reqwest::header::ACCEPT, "application/vnd.github+json")
        .send()
        .await
        .map_err(|error| format!("获取更新记录失败: {error}"))?
        .error_for_status()
        .map_err(|error| format!("获取更新记录失败: {error}"))?
        .json::<Vec<GithubRelease>>()
        .await
        .map_err(|error| format!("解析更新记录失败: {error}"))?;
    Ok(releases
        .into_iter()
        .filter_map(release_history_item)
        .collect())
}

fn validate_requested_update(requested: &str, available: &str) -> Result<(), String> {
    if requested == available {
        Ok(())
    } else {
        Err(format!(
            "可用版本已从 {requested} 变更为 {available}，请重新检查更新"
        ))
    }
}

#[tauri::command]
async fn install_update(app: AppHandle, version: String) -> Result<(), String> {
    let update = app
        .updater()
        .map_err(|error| format!("无法初始化更新器: {error}"))?
        .check()
        .await
        .map_err(|error| format!("检查更新失败: {error}"))?
        .ok_or_else(|| "当前已是最新版本".to_string())?;
    validate_requested_update(&version, &update.version)?;
    update
        .download_and_install(|_, _| {}, || {})
        .await
        .map_err(|error| format!("下载或安装更新失败: {error}"))?;
    app.restart()
}

fn classify_plan_test_status(status: reqwest::StatusCode) -> (&'static str, &'static str) {
    match status.as_u16() {
        200..=299 => ("available", "连接成功，模型可用"),
        401 | 403 => ("auth_failed", "鉴权失败，请检查 API key"),
        404 => ("model_not_found", "接口或模型不存在"),
        408 | 429 => ("busy", "服务暂时不可用或触发限流"),
        500..=599 => ("service_error", "服务端错误"),
        _ => ("error", "请求失败"),
    }
}

fn valid_test_url(value: &str) -> bool {
    let Ok(url) = reqwest::Url::parse(value) else {
        return false;
    };
    if url.scheme() == "https" {
        return true;
    }
    url.scheme() == "http" && matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "[::1]"))
}

fn valid_completion_response(body: &serde_json::Value) -> bool {
    body.get("choices")
        .and_then(serde_json::Value::as_array)
        .is_some_and(|choices| !choices.is_empty())
}

#[tauri::command]
async fn test_plan(base_url: String, key: String, model: String) -> Result<PlanTestResult, String> {
    let base_url = base_url.trim().trim_end_matches('/');
    let key = key.trim();
    let model = model.trim();
    if !valid_test_url(base_url) {
        return Err(
            "出于安全考虑，测试只允许 https:// 地址（localhost 可使用 http://）".to_string(),
        );
    }
    if key.is_empty() {
        return Err("此 Plan 没有可用的 API key".to_string());
    }
    if model.is_empty() {
        return Err("请选择模型".to_string());
    }

    let response = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|error| format!("创建测试请求失败: {error}"))?
        .post(format!("{base_url}/chat/completions"))
        .bearer_auth(key)
        .json(&serde_json::json!({
            "model": model,
            "messages": [{"role": "user", "content": "Reply with OK."}],
            "max_tokens": 1,
        }))
        .send()
        .await;

    let response = match response {
        Ok(response) => response,
        Err(error) if error.is_timeout() => {
            return Ok(PlanTestResult {
                status: "timeout".to_string(),
                message: "请求超时（10 秒）".to_string(),
            });
        }
        Err(error) => {
            return Ok(PlanTestResult {
                status: "error".to_string(),
                message: format!("连接失败: {error}"),
            });
        }
    };
    let status = response.status();
    let (kind, message) = classify_plan_test_status(status);
    if !status.is_success() {
        return Ok(PlanTestResult {
            status: kind.to_string(),
            message: format!("{}（HTTP {}）", message, status.as_u16()),
        });
    }
    let body = response
        .json::<serde_json::Value>()
        .await
        .map_err(|_| "服务返回了无法识别的响应".to_string())?;
    if !valid_completion_response(&body) {
        return Ok(PlanTestResult {
            status: "error".to_string(),
            message: format!(
                "响应不是有效的 Chat Completions 结果（HTTP {}）",
                status.as_u16()
            ),
        });
    }
    Ok(PlanTestResult {
        status: kind.to_string(),
        message: format!("{}（HTTP {}）", message, status.as_u16()),
    })
}

#[tauri::command]
fn env_plans() -> Vec<EnvPlan> {
    std::env::vars()
        .filter_map(|(name, value)| {
            let suffix = ["_API_KEY", "_APIKEY", "_AUTH_TOKEN", "_ACCESS_TOKEN"]
                .into_iter()
                .find(|suffix| name.to_ascii_uppercase().ends_with(suffix))?;
            if value.trim().is_empty() {
                return None;
            }
            let base = name[..name.len() - suffix.len()].to_ascii_uppercase();
            let id = format!("env-{}", base.to_ascii_lowercase().replace('_', "-"));
            let credential_fingerprint = credential_fingerprint(&value);
            Some(EnvPlan {
                id,
                name: base,
                source: "env".to_string(),
                source_detail: name,
                credential_fingerprint,
                models: Vec::new(),
            })
        })
        .collect::<Vec<_>>()
}

fn credential_fingerprint(value: &str) -> String {
    let mut fingerprint = String::with_capacity(12);
    for byte in &Sha256::digest(value.as_bytes())[..6] {
        write!(fingerprint, "{byte:02x}").unwrap();
    }
    fingerprint
}

#[tauri::command]
fn tray_set_menu(app: AppHandle, tools: Vec<TrayToolMenu>) -> Result<(), String> {
    let menu = Menu::new(&app).map_err(|e| e.to_string())?;
    for tool in tools {
        let submenu =
            Submenu::with_id(&app, tool.tool_id, tool.label, true).map_err(|e| e.to_string())?;
        for plan in tool.plans {
            let plan_submenu = Submenu::with_id(&app, plan.id, plan.label, plan.enabled)
                .map_err(|e| e.to_string())?;
            for item in plan.items {
                if item.checked {
                    let child = CheckMenuItem::with_id(
                        &app,
                        item.id,
                        item.label,
                        item.enabled,
                        true,
                        None::<&str>,
                    )
                    .map_err(|e| e.to_string())?;
                    plan_submenu.append(&child).map_err(|e| e.to_string())?;
                } else {
                    let child =
                        MenuItem::with_id(&app, item.id, item.label, item.enabled, None::<&str>)
                            .map_err(|e| e.to_string())?;
                    plan_submenu.append(&child).map_err(|e| e.to_string())?;
                }
            }
            submenu.append(&plan_submenu).map_err(|e| e.to_string())?;
        }
        menu.append(&submenu).map_err(|e| e.to_string())?;
    }
    let separator = PredefinedMenuItem::separator(&app).map_err(|e| e.to_string())?;
    menu.append(&separator).map_err(|e| e.to_string())?;
    let open = MenuItem::with_id(&app, "open-window", "打开 PlanDeck", true, None::<&str>)
        .map_err(|e| e.to_string())?;
    menu.append(&open).map_err(|e| e.to_string())?;
    let quit = PredefinedMenuItem::quit(&app, Some("退出 PlanDeck")).map_err(|e| e.to_string())?;
    menu.append(&quit).map_err(|e| e.to_string())?;

    let tray = app
        .tray_by_id("main")
        .ok_or_else(|| "托盘图标不可用".to_string())?;
    tray.set_menu(Some(menu)).map_err(|e| e.to_string())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CcSwitchRow {
    id: String,
    app_type: String,
    name: String,
    settings_config: String,
    notes: Option<String>,
}

#[tauri::command]
fn cc_switch_rows(state: tauri::State<AppState>) -> Result<Vec<CcSwitchRow>, String> {
    let path = Path::new(&state.home_dir).join(".cc-switch/cc-switch.db");
    if !path.exists() {
        return Ok(Vec::new());
    }
    let db = Connection::open_with_flags(&path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|e| format!("无法打开 ccSwitch 数据库 {}: {e}", path.display()))?;
    let mut statement = db
        .prepare("SELECT id, app_type, name, settings_config, notes FROM providers")
        .map_err(|e| format!("无法读取 ccSwitch providers 表: {e}"))?;
    let rows = statement
        .query_map([], |row| {
            Ok(CcSwitchRow {
                id: row.get(0)?,
                app_type: row.get(1)?,
                name: row.get(2)?,
                settings_config: row.get(3)?,
                notes: row.get(4)?,
            })
        })
        .map_err(|e| format!("无法查询 ccSwitch providers 表: {e}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("无法解析 ccSwitch providers 行: {e}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            let home_dir = env_or("PLANDECK_HOME", || {
                app.path()
                    .home_dir()
                    .map(|p| p.to_string_lossy().into_owned())
                    .map_err(|e| e.to_string())
            })
            .expect("无法解析 HOME");
            let data_dir = env_or("PLANDECK_DATA_DIR", || {
                app.path()
                    .app_data_dir()
                    .map(|p| p.to_string_lossy().into_owned())
                    .map_err(|e| e.to_string())
            })
            .expect("无法解析数据目录");
            std::fs::create_dir_all(&data_dir).expect("无法创建数据目录");
            app.manage(AppState { home_dir, data_dir });

            // 托盘占位图标（行为见票 06）
            TrayIconBuilder::with_id("main")
                .icon(
                    Image::from_bytes(include_bytes!("../icons/32x32.png")).expect("托盘图标缺失"),
                )
                .icon_as_template(true)
                .tooltip("PlanDeck")
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .on_menu_event(|app, event| {
            let id = event.id().as_ref();
            if id == "open-window" {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            } else {
                let _ = app.emit("tray-action", id);
            }
        })
        .invoke_handler(tauri::generate_handler![
            fs_exists,
            fs_read,
            fs_write,
            fs_list,
            fs_is_directory,
            fs_mtime,
            sqlite_query,
            backup_files,
            list_backups,
            restore_backup,
            open_in_editor,
            home_dir,
            data_dir,
            app_version,
            env_plans,
            test_plan,
            check_for_update,
            release_history,
            install_update,
            tray_set_menu,
            cc_switch_rows
        ])
        .run(tauri::generate_context!())
        .expect("PlanDeck 启动失败");
}

#[cfg(test)]
mod tests {
    use super::{
        classify_plan_test_status, credential_fingerprint, release_history_item,
        valid_completion_response, valid_test_url, validate_requested_update, GithubRelease,
    };

    #[test]
    fn credential_fingerprint_is_truncated_lowercase_sha256() {
        assert_eq!(credential_fingerprint("secret"), "2bb80d537b1d");
    }

    #[test]
    fn plan_test_statuses_are_user_facing_categories() {
        assert_eq!(
            classify_plan_test_status(reqwest::StatusCode::OK).0,
            "available"
        );
        assert_eq!(
            classify_plan_test_status(reqwest::StatusCode::UNAUTHORIZED).0,
            "auth_failed"
        );
        assert_eq!(
            classify_plan_test_status(reqwest::StatusCode::NOT_FOUND).0,
            "model_not_found"
        );
        assert_eq!(
            classify_plan_test_status(reqwest::StatusCode::TOO_MANY_REQUESTS).0,
            "busy"
        );
        assert_eq!(
            classify_plan_test_status(reqwest::StatusCode::BAD_GATEWAY).0,
            "service_error"
        );
    }

    #[test]
    fn install_requires_the_version_that_was_confirmed() {
        assert!(validate_requested_update("0.2.0", "0.2.0").is_ok());
        assert!(validate_requested_update("0.2.0", "0.2.1").is_err());
    }

    #[test]
    fn release_history_excludes_drafts_and_the_machine_feed() {
        let release = |tag_name: &str, draft: bool| GithubRelease {
            tag_name: tag_name.to_string(),
            name: None,
            body: Some("notes".to_string()),
            published_at: Some("2026-08-17T12:00:00Z".to_string()),
            prerelease: true,
            draft,
        };
        assert!(release_history_item(release("v0.2.0", false)).is_some());
        assert!(release_history_item(release("updater", false)).is_none());
        assert!(release_history_item(release("v0.3.0", true)).is_none());
    }

    #[test]
    fn plan_test_url_requires_tls_except_localhost() {
        assert!(valid_test_url("https://api.example.com/v1"));
        assert!(valid_test_url("http://localhost:3000/v1"));
        assert!(!valid_test_url("http://localhost.example.com/v1"));
        assert!(!valid_test_url("http://api.example.com/v1"));
    }

    #[test]
    fn plan_test_requires_a_completion_choice() {
        assert!(valid_completion_response(
            &serde_json::json!({ "choices": [{}] })
        ));
        assert!(!valid_completion_response(
            &serde_json::json!({ "error": "bad key" })
        ));
        assert!(!valid_completion_response(
            &serde_json::json!({ "choices": [] })
        ));
    }
}
