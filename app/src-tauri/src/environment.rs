// input: ~/.config/ai-subscriptions/subscriptions.env + fsx 备份
// output: EnvironmentStore：env 解析/校验/原子写/备份、loader 安装、遗留凭据迁移（凭据不出边界）
// position: 环境凭据唯一读写边界
// 维护：一旦我被更新，务必更新我的开头注释，以及所属文件夹的 FOLDER.md。

use std::collections::{BTreeMap, HashMap};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::fsx;

const VERSION: &str = "1";
const SOURCE_START: &str = "# >>> PlanDeck subscriptions >>>";
const SOURCE_END: &str = "# <<< PlanDeck subscriptions <<<";
const LEGACY_SHELL_API_KEYS: &[&str] = &["MINIMAX_API_KEY"];

#[derive(Clone, Debug)]
struct FileSnapshot {
    path: PathBuf,
    bytes: Option<Vec<u8>>,
    mode: Option<u32>,
}

#[derive(Clone, Debug, Default)]
struct PlanRecord {
    name: String,
    provider: String,
    base_url: String,
    models: Vec<String>,
    api_key: Option<String>,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SubscriptionGroup {
    pub id: String,
    pub provider: String,
    pub base_url: String,
    pub model: String,
    pub members: Vec<String>,
    pub selected: String,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolBinding {
    pub tool_id: String,
    pub group_id: String,
}

#[derive(Clone, Debug, Default)]
struct EnvironmentFile {
    version: String,
    plans: BTreeMap<String, PlanRecord>,
    groups: BTreeMap<String, SubscriptionGroup>,
    bindings: BTreeMap<String, ToolBinding>,
    comments: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentPlanView {
    pub id: String,
    pub name: String,
    pub provider: String,
    pub base_url: String,
    pub models: Vec<String>,
    pub has_credential: bool,
    pub credential_fingerprint: Option<String>,
}

#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentCatalogView {
    pub version: String,
    pub plans: Vec<EnvironmentPlanView>,
    pub groups: Vec<SubscriptionGroup>,
    pub bindings: Vec<ToolBinding>,
    pub errors: Vec<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentPlanWrite {
    pub id: String,
    pub name: String,
    pub provider: String,
    pub base_url: String,
    pub models: Vec<String>,
    pub credential: Option<String>,
    #[serde(default)]
    pub clear_credential: bool,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentCatalogWrite {
    pub version: String,
    pub plans: Vec<EnvironmentPlanWrite>,
    pub groups: Vec<SubscriptionGroup>,
    pub bindings: Vec<ToolBinding>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoaderInstallResult {
    pub installed: Vec<String>,
    pub backups: Vec<String>,
}

#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrationPreview {
    pub candidate_plans: usize,
    pub candidate_sources: Vec<String>,
    pub warnings: Vec<String>,
}

#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrationResult {
    pub imported_plans: usize,
    pub removed_catalog_keys: usize,
    pub removed_shell_assignments: usize,
    pub backups: Vec<String>,
    pub affected_paths: Vec<String>,
}

pub struct EnvironmentStore {
    home_dir: PathBuf,
    data_dir: PathBuf,
}

impl EnvironmentStore {
    pub fn new(home_dir: &str, data_dir: &str) -> Self {
        Self {
            home_dir: PathBuf::from(home_dir),
            data_dir: PathBuf::from(data_dir),
        }
    }

    fn directory(&self) -> PathBuf {
        self.home_dir.join(".config/ai-subscriptions")
    }

    fn path(&self) -> PathBuf {
        self.directory().join("subscriptions.env")
    }

    fn read_internal(&self) -> Result<EnvironmentFile, String> {
        let path = self.path();
        if !path.exists() {
            return Ok(EnvironmentFile {
                version: VERSION.to_string(),
                ..EnvironmentFile::default()
            });
        }
        check_private_permissions(&self.directory(), &path)?;
        parse_environment(
            &fs::read_to_string(&path)
                .map_err(|error| format!("读取环境订阅失败 {}: {error}", path.display()))?,
        )
    }

    pub fn read(&self) -> Result<EnvironmentCatalogView, String> {
        let file = self.read_internal()?;
        Ok(to_view(&file, validate(&file)))
    }

    pub fn plan_test_input(&self, plan_id: &str) -> Result<(String, String), String> {
        validate_id(plan_id, "Plan")?;
        let file = self.read_internal()?;
        let plan = file
            .plans
            .get(plan_id)
            .ok_or_else(|| format!("Plan 不存在: {plan_id}"))?;
        let key = plan
            .api_key
            .as_deref()
            .filter(|key| !key.is_empty())
            .ok_or_else(|| "此 Plan 没有可用的 API key".to_string())?;
        Ok((plan.base_url.clone(), key.to_string()))
    }

    pub fn save(&self, input: EnvironmentCatalogWrite) -> Result<EnvironmentCatalogView, String> {
        if input.version != VERSION {
            return Err(format!("不支持的环境文件版本: {}", input.version));
        }
        let old = self.read_internal()?;
        let mut next = EnvironmentFile {
            version: input.version,
            comments: old.comments.clone(),
            ..EnvironmentFile::default()
        };
        for plan in input.plans {
            validate_id(&plan.id, "Plan")?;
            let preserved = old
                .plans
                .get(&plan.id)
                .and_then(|item| item.api_key.clone());
            let api_key = if plan.clear_credential {
                None
            } else {
                plan.credential
                    .filter(|value| !value.is_empty())
                    .or(preserved)
            };
            next.plans.insert(
                plan.id,
                PlanRecord {
                    name: plan.name,
                    provider: plan.provider,
                    base_url: plan.base_url,
                    models: plan.models,
                    api_key,
                },
            );
        }
        for group in input.groups {
            validate_id(&group.id, "Group")?;
            next.groups.insert(group.id.clone(), group);
        }
        for binding in input.bindings {
            validate_id(&binding.tool_id, "Tool")?;
            next.bindings.insert(binding.tool_id.clone(), binding);
        }
        let errors = validate(&next);
        if !errors.is_empty() {
            return Err(errors.join("\n"));
        }
        self.write_internal(&next)?;
        Ok(to_view(&next, Vec::new()))
    }

    pub fn select(&self, group_id: &str, plan_id: &str) -> Result<EnvironmentCatalogView, String> {
        validate_id(group_id, "Group")?;
        validate_id(plan_id, "Plan")?;
        let mut file = self.read_internal()?;
        let group = file
            .groups
            .get_mut(group_id)
            .ok_or_else(|| format!("Group 不存在: {group_id}"))?;
        if !group.members.iter().any(|member| member == plan_id) {
            return Err(format!("Plan {plan_id} 不是 Group {group_id} 的成员"));
        }
        group.selected = plan_id.to_string();
        let errors = validate(&file);
        if !errors.is_empty() {
            return Err(errors.join("\n"));
        }
        self.write_internal(&file)?;
        Ok(to_view(&file, Vec::new()))
    }

    fn write_internal(&self, file: &EnvironmentFile) -> Result<(), String> {
        let directory = self.directory();
        fs::create_dir_all(&directory)
            .map_err(|error| format!("创建环境订阅目录失败 {}: {error}", directory.display()))?;
        set_mode(&directory, 0o700)?;
        let path = self.path();
        if path.exists() {
            fsx::backup_files(
                &self.data_dir,
                "environment",
                &[path.to_string_lossy().into_owned()],
            )?;
        }
        let text = serialize_environment(file)?;
        fsx::atomic_write(&path, &text, Some(0o600))
    }

    pub fn install_loader(&self) -> Result<LoaderInstallResult, String> {
        let directory = self.directory();
        let bin_dir = self.home_dir.join(".local/bin");
        let load_path = directory.join("load.zsh");
        let run_path = bin_dir.join("ai-env-run");
        let zshenv_path = self.home_dir.join(".zshenv");
        let targets = [&load_path, &run_path, &zshenv_path];
        let snapshots = snapshot_files(&targets)?;
        let existing: Vec<String> = targets
            .iter()
            .filter(|path| path.exists())
            .map(|path| path.to_string_lossy().into_owned())
            .collect();
        let backups = if existing.is_empty() {
            Vec::new()
        } else {
            fsx::backup_files(&self.data_dir, "environment-loader", &existing)?
                .into_iter()
                .map(|path| path.to_string_lossy().into_owned())
                .collect()
        };
        if let Err(error) = self.install_loader_unchecked() {
            let restore_errors = restore_snapshots(&snapshots);
            return Err(rollback_error("安装 loader", error, restore_errors));
        }
        Ok(LoaderInstallResult {
            installed: targets
                .iter()
                .map(|path| path.to_string_lossy().into_owned())
                .collect(),
            backups,
        })
    }

    fn install_loader_unchecked(&self) -> Result<(), String> {
        let directory = self.directory();
        let bin_dir = self.home_dir.join(".local/bin");
        fs::create_dir_all(&directory)
            .map_err(|error| format!("创建目录失败 {}: {error}", directory.display()))?;
        fs::create_dir_all(&bin_dir)
            .map_err(|error| format!("创建目录失败 {}: {error}", bin_dir.display()))?;
        set_mode(&directory, 0o700)?;

        let load_path = directory.join("load.zsh");
        let run_path = bin_dir.join("ai-env-run");
        let zshenv_path = self.home_dir.join(".zshenv");
        fsx::atomic_write(&load_path, LOADER_ZSH, Some(0o600))?;
        fsx::atomic_write(&run_path, ENV_RUN_ZSH, Some(0o700))?;
        let old_zshenv = fs::read_to_string(&zshenv_path).unwrap_or_default();
        let clean = remove_marked_block(&old_zshenv);
        let separator = if clean.is_empty() || clean.ends_with('\n') {
            ""
        } else {
            "\n"
        };
        let block = format!(
            "{SOURCE_START}\n[[ -r \"$HOME/.config/ai-subscriptions/load.zsh\" ]] && source \"$HOME/.config/ai-subscriptions/load.zsh\"\n{SOURCE_END}\n"
        );
        fsx::atomic_write(
            &zshenv_path,
            &format!("{clean}{separator}{block}"),
            Some(0o600),
        )
    }

    pub fn migration_preview(&self) -> Result<MigrationPreview, String> {
        let catalog_path = self.data_dir.join("catalog.json");
        let mut preview = MigrationPreview::default();
        if catalog_path.exists() {
            let text = fs::read_to_string(&catalog_path).map_err(|error| error.to_string())?;
            let value: serde_json::Value = serde_json::from_str(&text)
                .map_err(|error| format!("解析 Catalog 失败: {error}"))?;
            if let Some(plans) = value.get("plans").and_then(serde_json::Value::as_array) {
                for plan in plans {
                    if plan
                        .get("key")
                        .and_then(serde_json::Value::as_str)
                        .is_some_and(|key| !key.is_empty())
                    {
                        preview.candidate_plans += 1;
                        preview
                            .candidate_sources
                            .push(catalog_path.to_string_lossy().into_owned());
                    }
                }
            }
        }
        let zshrc = self.home_dir.join(".zshrc");
        if zshrc.exists() {
            let text = fs::read_to_string(&zshrc).map_err(|error| error.to_string())?;
            for line in text.lines() {
                if let Some((name, _)) = parse_migratable_shell_api_key(line) {
                    preview.candidate_plans += 1;
                    preview
                        .candidate_sources
                        .push(format!("{}:{name}", zshrc.display()));
                }
            }
        }
        preview.candidate_sources.sort();
        preview.candidate_sources.dedup();
        Ok(preview)
    }

    pub fn migrate_legacy(&self) -> Result<MigrationResult, String> {
        self.migrate_legacy_inner(None)
    }

    fn migrate_legacy_inner(&self, fail_after: Option<&str>) -> Result<MigrationResult, String> {
        let catalog_path = self.data_dir.join("catalog.json");
        let zshrc_path = self.home_dir.join(".zshrc");
        let env_path = self.path();
        let catalog_text = if catalog_path.exists() {
            Some(fs::read_to_string(&catalog_path).map_err(|error| error.to_string())?)
        } else {
            None
        };
        let zshrc_text = if zshrc_path.exists() {
            Some(fs::read_to_string(&zshrc_path).map_err(|error| error.to_string())?)
        } else {
            None
        };
        let mut env = self.read_internal()?;
        let mut imported = 0usize;
        let mut removed_catalog_keys = 0usize;
        let mut removed_shell_assignments = 0usize;
        let mut catalog_value = catalog_text
            .as_deref()
            .map(serde_json::from_str::<serde_json::Value>)
            .transpose()
            .map_err(|error| format!("解析 Catalog 失败: {error}"))?;
        if let Some(value) = catalog_value.as_mut() {
            if let Some(plans) = value
                .get_mut("plans")
                .and_then(serde_json::Value::as_array_mut)
            {
                for plan in plans {
                    let key = plan
                        .get("key")
                        .and_then(serde_json::Value::as_str)
                        .filter(|key| !key.is_empty())
                        .map(str::to_string);
                    if let Some(key) = key {
                        let id = unique_plan_id(
                            &env.plans,
                            plan.get("id")
                                .and_then(serde_json::Value::as_str)
                                .or_else(|| plan.get("name").and_then(serde_json::Value::as_str))
                                .unwrap_or("PLAN"),
                        );
                        let name = plan
                            .get("name")
                            .and_then(serde_json::Value::as_str)
                            .unwrap_or(&id)
                            .to_string();
                        let provider = plan
                            .get("providerId")
                            .and_then(serde_json::Value::as_str)
                            .unwrap_or("")
                            .to_string();
                        let base_url = plan
                            .get("baseUrl")
                            .and_then(serde_json::Value::as_str)
                            .unwrap_or("")
                            .to_string();
                        let models = plan
                            .get("models")
                            .and_then(serde_json::Value::as_array)
                            .map(|items| {
                                items
                                    .iter()
                                    .filter_map(serde_json::Value::as_str)
                                    .map(str::to_string)
                                    .collect()
                            })
                            .unwrap_or_default();
                        env.plans.insert(
                            id.clone(),
                            PlanRecord {
                                name,
                                provider,
                                base_url,
                                models,
                                api_key: Some(key),
                            },
                        );
                        imported += 1;
                    }
                    if let Some(object) = plan.as_object_mut() {
                        if object.remove("key").is_some() {
                            removed_catalog_keys += 1;
                        }
                    }
                }
            }
        }
        let mut clean_zshrc = zshrc_text.clone();
        if let Some(text) = zshrc_text.as_deref() {
            let mut kept = Vec::new();
            for line in text.lines() {
                if let Some((name, key)) = parse_migratable_shell_api_key(line) {
                    let id = unique_plan_id(&env.plans, name.trim_end_matches("_API_KEY"));
                    env.plans.entry(id.clone()).or_insert_with(|| PlanRecord {
                        name: id.clone(),
                        provider: String::new(),
                        base_url: String::new(),
                        models: Vec::new(),
                        api_key: Some(key),
                    });
                    imported += 1;
                    removed_shell_assignments += 1;
                } else {
                    kept.push(line);
                }
            }
            clean_zshrc = Some(format!("{}\n", kept.join("\n")));
        }
        // Build compatible groups from migrated provider/base URL/model contracts.
        let migrated_plans: Vec<(String, PlanRecord)> = env
            .plans
            .iter()
            .map(|(id, plan)| (id.clone(), plan.clone()))
            .collect();
        for (plan_id, plan) in migrated_plans {
            if plan.provider.is_empty() || plan.base_url.is_empty() || plan.api_key.is_none() {
                continue;
            }
            for model in &plan.models {
                if model.is_empty() {
                    continue;
                }
                let existing = env.groups.values_mut().find(|group| {
                    group.provider == plan.provider
                        && normalize_url(&group.base_url) == normalize_url(&plan.base_url)
                        && group.model == *model
                });
                if let Some(group) = existing {
                    if !group.members.iter().any(|member| member == &plan_id) {
                        group.members.push(plan_id.clone());
                    }
                    continue;
                }
                let base = format!(
                    "AUTO_{}_{}",
                    sanitize_id(&plan.provider),
                    sanitize_id(model)
                );
                let group_id = unique_group_id(&env.groups, &base);
                env.groups.insert(
                    group_id.clone(),
                    SubscriptionGroup {
                        id: group_id,
                        provider: plan.provider.clone(),
                        base_url: plan.base_url.clone(),
                        model: model.clone(),
                        members: vec![plan_id.clone()],
                        selected: plan_id.clone(),
                    },
                );
            }
        }
        let validation_errors = validate(&env);
        if !validation_errors.is_empty() {
            return Err(validation_errors.join("\n"));
        }
        if imported == 0 && removed_catalog_keys == 0 && removed_shell_assignments == 0 {
            return Ok(MigrationResult::default());
        }
        let load_path = self.directory().join("load.zsh");
        let run_path = self.home_dir.join(".local/bin/ai-env-run");
        let zshenv_path = self.home_dir.join(".zshenv");
        let changed_paths = [
            env_path.clone(),
            load_path.clone(),
            run_path.clone(),
            zshenv_path.clone(),
            catalog_path.clone(),
            zshrc_path.clone(),
        ];
        let snapshots = snapshot_files(&changed_paths.iter().collect::<Vec<_>>())?;
        let mut backup_candidates = changed_paths.to_vec();
        backup_candidates.extend(self.migration_safety_paths()?);
        backup_candidates.sort();
        backup_candidates.dedup();
        let mut paths = Vec::new();
        for path in &backup_candidates {
            if path.exists() {
                paths.push(path.to_string_lossy().into_owned());
            }
        }
        let backups = if paths.is_empty() {
            Vec::new()
        } else {
            fsx::backup_files(&self.data_dir, "environment-migration", &paths)?
                .into_iter()
                .map(|path| path.to_string_lossy().into_owned())
                .collect()
        };
        let env_text = serialize_environment(&env)?;
        self.validate_with_zsh(&env_text)?;
        let operation = (|| {
            fs::create_dir_all(self.directory())
                .map_err(|error| format!("创建环境订阅目录失败: {error}"))?;
            set_mode(&self.directory(), 0o700)?;
            fsx::atomic_write(&env_path, &env_text, Some(0o600))?;
            if fail_after == Some("env") {
                return Err("测试注入：env 写入后失败".to_string());
            }
            self.install_loader_unchecked()?;
            if fail_after == Some("loader") {
                return Err("测试注入：loader 写入后失败".to_string());
            }
            if let Some(value) = catalog_value {
                fsx::atomic_write(
                    &catalog_path,
                    &format!(
                        "{}\n",
                        serde_json::to_string_pretty(&value).map_err(|error| error.to_string())?
                    ),
                    Some(0o600),
                )?;
            }
            if let Some(text) = clean_zshrc {
                fsx::atomic_write(&zshrc_path, &text, Some(0o600))?;
            }
            Ok::<(), String>(())
        })();
        if let Err(error) = operation {
            let restore_errors = restore_snapshots(&snapshots);
            return Err(rollback_error("迁移", error, restore_errors));
        }
        let affected_paths = changed_paths
            .iter()
            .filter(|path| path.exists())
            .map(|path| path.to_string_lossy().into_owned())
            .collect();
        Ok(MigrationResult {
            imported_plans: imported,
            removed_catalog_keys,
            removed_shell_assignments,
            backups,
            affected_paths,
        })
    }

    fn validate_with_zsh(&self, text: &str) -> Result<(), String> {
        let directory = self.directory();
        fs::create_dir_all(&directory)
            .map_err(|error| format!("创建迁移验证目录失败 {}: {error}", directory.display()))?;
        set_mode(&directory, 0o700)?;
        let path = directory.join(format!(
            ".subscriptions.env.validation-{}",
            std::process::id()
        ));
        fsx::atomic_write(&path, text, Some(0o600))?;
        let output = Command::new("/bin/zsh")
            .args([
                "-f",
                "-c",
                r#"source "$1" || exit 21
for selected_name in ${(k)parameters[(I)PLANDECK_GROUP_*_SELECTED]}; do
  selected="${(P)selected_name}"
  key_name="PLANDECK_PLAN_${selected}_API_KEY"
  [[ -n "${(P)key_name}" ]] || exit 22
done"#,
                "plandeck-migration-validation",
            ])
            .arg(&path)
            .output();
        let cleanup_error = fs::remove_file(&path).err();
        let output = output.map_err(|error| format!("无法运行 /bin/zsh 验证环境文件: {error}"))?;
        if let Some(error) = cleanup_error {
            return Err(format!("删除迁移验证文件失败 {}: {error}", path.display()));
        }
        if !output.status.success() {
            return Err(format!(
                "/bin/zsh 环境验证失败（退出码 {}）",
                output.status.code().unwrap_or(-1)
            ));
        }
        Ok(())
    }

    fn migration_safety_paths(&self) -> Result<Vec<PathBuf>, String> {
        let mut paths = vec![
            self.home_dir.join(".codex/config.toml"),
            self.home_dir.join(".config/opencode/opencode.json"),
            self.home_dir.join(".config/opencode/opencode.jsonc"),
            self.home_dir.join(".claude/settings.json"),
            self.home_dir.join(".hermes/config.yaml"),
            self.home_dir.join(".zcode/v2/config.json"),
            self.home_dir.join(".kimi/config.toml"),
        ];
        let agents = self.home_dir.join("Library/LaunchAgents");
        if agents.exists() {
            for entry in fs::read_dir(&agents)
                .map_err(|error| format!("读取 LaunchAgents 失败 {}: {error}", agents.display()))?
            {
                let path = entry.map_err(|error| error.to_string())?.path();
                let name = path
                    .file_name()
                    .and_then(|name| name.to_str())
                    .unwrap_or_default()
                    .to_ascii_lowercase();
                if path.extension().and_then(|ext| ext.to_str()) == Some("plist")
                    && (name.contains("hermes") || name.contains("openclaw"))
                {
                    paths.push(path);
                }
            }
        }
        Ok(paths)
    }
}

fn parse_environment(text: &str) -> Result<EnvironmentFile, String> {
    let mut values = BTreeMap::new();
    let mut comments = Vec::new();
    for (index, original) in text.lines().enumerate() {
        let line = original.trim();
        if line.is_empty() || line.starts_with('#') {
            if line.starts_with('#') {
                comments.push(original.to_string());
            }
            continue;
        }
        let (name, raw) = line
            .split_once('=')
            .ok_or_else(|| format!("第 {} 行必须是 NAME='VALUE'", index + 1))?;
        if !name.starts_with("PLANDECK_") || !valid_name(name) {
            return Err(format!("第 {} 行变量不属于 PLANDECK 命名空间", index + 1));
        }
        if values.contains_key(name) {
            return Err(format!("第 {} 行变量重复: {name}", index + 1));
        }
        values.insert(name.to_string(), parse_quoted(raw, index + 1)?);
    }
    let version = values
        .remove("PLANDECK_ENV_VERSION")
        .unwrap_or_else(|| VERSION.to_string());
    if version != VERSION {
        return Err(format!("不支持的环境文件版本: {version}"));
    }
    let mut file = EnvironmentFile {
        version,
        comments,
        ..EnvironmentFile::default()
    };
    for (name, value) in values {
        if let Some((id, field)) = named_field(
            &name,
            "PLANDECK_PLAN_",
            &["NAME", "PROVIDER", "BASE_URL", "MODELS", "API_KEY"],
        ) {
            validate_id(id, "Plan")?;
            let plan = file.plans.entry(id.to_string()).or_default();
            match field {
                "NAME" => plan.name = value,
                "PROVIDER" => plan.provider = value,
                "BASE_URL" => plan.base_url = value,
                "MODELS" => plan.models = parse_string_array(&value, &name)?,
                "API_KEY" => plan.api_key = Some(value),
                _ => unreachable!(),
            }
            continue;
        }
        if let Some((id, field)) = named_field(
            &name,
            "PLANDECK_GROUP_",
            &["PROVIDER", "BASE_URL", "MODEL", "MEMBERS", "SELECTED"],
        ) {
            validate_id(id, "Group")?;
            let group = file
                .groups
                .entry(id.to_string())
                .or_insert_with(|| SubscriptionGroup {
                    id: id.to_string(),
                    ..SubscriptionGroup::default()
                });
            match field {
                "PROVIDER" => group.provider = value,
                "BASE_URL" => group.base_url = value,
                "MODEL" => group.model = value,
                "MEMBERS" => group.members = parse_string_array(&value, &name)?,
                "SELECTED" => group.selected = value,
                _ => unreachable!(),
            }
            continue;
        }
        if let Some(id) = name
            .strip_prefix("PLANDECK_TOOL_")
            .and_then(|rest| rest.strip_suffix("_GROUP"))
        {
            validate_id(id, "Tool")?;
            file.bindings.insert(
                id.to_string(),
                ToolBinding {
                    tool_id: id.to_string(),
                    group_id: value,
                },
            );
            continue;
        }
        return Err(format!("未知的 PLANDECK 变量: {name}"));
    }
    Ok(file)
}

fn validate(file: &EnvironmentFile) -> Vec<String> {
    let mut errors = Vec::new();
    for (id, group) in &file.groups {
        if group.provider.is_empty() {
            errors.push(format!("Group {id} 缺少 provider"));
        }
        if group.base_url.is_empty() {
            errors.push(format!("Group {id} 缺少 base URL"));
        }
        if group.model.is_empty() {
            errors.push(format!("Group {id} 缺少固定模型"));
        }
        if group.members.is_empty() {
            errors.push(format!("Group {id} 没有成员"));
        }
        if !group.members.iter().any(|member| member == &group.selected) {
            errors.push(format!("Group {id} 的 SELECTED 不是成员"));
        }
        for member_id in &group.members {
            let Some(member) = file.plans.get(member_id) else {
                errors.push(format!("Group {id} 的成员不存在: {member_id}"));
                continue;
            };
            if member.api_key.as_deref().unwrap_or_default().is_empty() {
                errors.push(format!("Group {id} 的成员缺少凭据: {member_id}"));
            }
            if member.provider != group.provider {
                errors.push(format!("Group {id} 的 provider 与 {member_id} 不一致"));
            }
            if normalize_url(&member.base_url) != normalize_url(&group.base_url) {
                errors.push(format!("Group {id} 的 base URL 与 {member_id} 不一致"));
            }
            if !member.models.iter().any(|model| model == &group.model) {
                errors.push(format!("Group {id} 的模型不在 {member_id} 的模型清单中"));
            }
        }
    }
    for binding in file.bindings.values() {
        if !file.groups.contains_key(&binding.group_id) {
            errors.push(format!(
                "Tool {} 绑定了不存在的 Group {}",
                binding.tool_id, binding.group_id
            ));
        }
    }
    let mut aliases: HashMap<&str, &str> = HashMap::new();
    for binding in file.bindings.values() {
        let Some(group) = file.groups.get(&binding.group_id) else {
            continue;
        };
        let alias = match binding.tool_id.as_str() {
            "CLAUDE" => Some("ANTHROPIC_AUTH_TOKEN"),
            "HERMES" if group.provider.to_ascii_lowercase().contains("anthropic") => {
                Some("ANTHROPIC_API_KEY")
            }
            "HERMES" => Some("OPENAI_API_KEY"),
            _ => None,
        };
        if let Some(alias) = alias {
            if let Some(previous) = aliases.insert(alias, &binding.group_id) {
                if previous != binding.group_id {
                    errors.push(format!("环境别名 {alias} 同时绑定了不同 Group"));
                }
            }
        }
    }
    errors
}

fn to_view(file: &EnvironmentFile, errors: Vec<String>) -> EnvironmentCatalogView {
    EnvironmentCatalogView {
        version: file.version.clone(),
        plans: file
            .plans
            .iter()
            .map(|(id, plan)| EnvironmentPlanView {
                id: id.clone(),
                name: plan.name.clone(),
                provider: plan.provider.clone(),
                base_url: plan.base_url.clone(),
                models: plan.models.clone(),
                has_credential: plan.api_key.as_deref().is_some_and(|key| !key.is_empty()),
                credential_fingerprint: plan
                    .api_key
                    .as_deref()
                    .filter(|key| !key.is_empty())
                    .map(fingerprint),
            })
            .collect(),
        groups: file.groups.values().cloned().collect(),
        bindings: file.bindings.values().cloned().collect(),
        errors,
    }
}

fn serialize_environment(file: &EnvironmentFile) -> Result<String, String> {
    let mut lines = file.comments.clone();
    if lines.is_empty() {
        lines.push("# PlanDeck managed environment".to_string());
    }
    lines.push(format!("PLANDECK_ENV_VERSION={}", quote(&file.version)?));
    lines.push(String::new());
    for (id, plan) in &file.plans {
        lines.push(format!("PLANDECK_PLAN_{id}_NAME={}", quote(&plan.name)?));
        lines.push(format!(
            "PLANDECK_PLAN_{id}_PROVIDER={}",
            quote(&plan.provider)?
        ));
        lines.push(format!(
            "PLANDECK_PLAN_{id}_BASE_URL={}",
            quote(&plan.base_url)?
        ));
        lines.push(format!(
            "PLANDECK_PLAN_{id}_MODELS={}",
            quote(&serde_json::to_string(&plan.models).map_err(|error| error.to_string())?)?
        ));
        if let Some(key) = &plan.api_key {
            lines.push(format!("PLANDECK_PLAN_{id}_API_KEY={}", quote(key)?));
        }
        lines.push(String::new());
    }
    for (id, group) in &file.groups {
        lines.push(format!(
            "PLANDECK_GROUP_{id}_PROVIDER={}",
            quote(&group.provider)?
        ));
        lines.push(format!(
            "PLANDECK_GROUP_{id}_BASE_URL={}",
            quote(&group.base_url)?
        ));
        lines.push(format!(
            "PLANDECK_GROUP_{id}_MODEL={}",
            quote(&group.model)?
        ));
        lines.push(format!(
            "PLANDECK_GROUP_{id}_MEMBERS={}",
            quote(&serde_json::to_string(&group.members).map_err(|error| error.to_string())?)?
        ));
        lines.push(format!(
            "PLANDECK_GROUP_{id}_SELECTED={}",
            quote(&group.selected)?
        ));
        lines.push(String::new());
    }
    for (id, binding) in &file.bindings {
        lines.push(format!(
            "PLANDECK_TOOL_{id}_GROUP={}",
            quote(&binding.group_id)?
        ));
    }
    Ok(format!("{}\n", lines.join("\n").trim_end()))
}

fn parse_quoted(raw: &str, line: usize) -> Result<String, String> {
    let chars: Vec<char> = raw.chars().collect();
    if chars.first() != Some(&'\'') {
        return Err(format!("第 {line} 行必须使用单引号"));
    }
    let mut value = String::new();
    let mut index = 1;
    while index < chars.len() {
        if chars[index] != '\'' {
            if matches!(chars[index], '\0' | '\n' | '\r') {
                return Err(format!("第 {line} 行包含非法控制字符"));
            }
            value.push(chars[index]);
            index += 1;
            continue;
        }
        if chars.get(index..index + 4) == Some(&['\'', '\\', '\'', '\''][..]) {
            value.push('\'');
            index += 4;
            continue;
        }
        if index == chars.len() - 1 {
            return Ok(value);
        }
        return Err(format!("第 {line} 行单引号后有额外内容"));
    }
    Err(format!("第 {line} 行单引号未闭合"))
}

fn quote(value: &str) -> Result<String, String> {
    if value.contains(['\0', '\n', '\r']) {
        return Err("环境变量值不能包含 NUL 或换行".to_string());
    }
    Ok(format!("'{}'", value.replace('\'', "'\\''")))
}

fn parse_string_array(value: &str, name: &str) -> Result<Vec<String>, String> {
    serde_json::from_str::<Vec<String>>(value).map_err(|_| format!("{name} 必须是 JSON 字符串数组"))
}

fn named_field<'a>(name: &'a str, prefix: &str, fields: &[&str]) -> Option<(&'a str, &'a str)> {
    let rest = name.strip_prefix(prefix)?;
    for field in fields {
        let suffix = format!("_{field}");
        if let Some(id) = rest.strip_suffix(&suffix) {
            return Some((id, &name[name.len() - field.len()..]));
        }
    }
    None
}

fn valid_name(name: &str) -> bool {
    name.chars()
        .next()
        .is_some_and(|ch| ch.is_ascii_alphabetic())
        && name
            .chars()
            .all(|ch| ch.is_ascii_uppercase() || ch.is_ascii_digit() || ch == '_')
}

fn validate_id(id: &str, label: &str) -> Result<(), String> {
    if valid_name(id) {
        Ok(())
    } else {
        Err(format!("{label} ID 非法: {id}"))
    }
}

fn normalize_url(value: &str) -> String {
    value.trim().trim_end_matches('/').to_ascii_lowercase()
}

fn fingerprint(value: &str) -> String {
    let mut fingerprint = String::with_capacity(12);
    for byte in &Sha256::digest(value.as_bytes())[..6] {
        use std::fmt::Write as _;
        write!(fingerprint, "{byte:02x}").unwrap();
    }
    fingerprint
}

fn remove_marked_block(text: &str) -> String {
    let Some(start) = text.find(SOURCE_START) else {
        return text.to_string();
    };
    let Some(relative_end) = text[start..].find(SOURCE_END) else {
        return text.to_string();
    };
    let end = start + relative_end + SOURCE_END.len();
    let end = if text.as_bytes().get(end) == Some(&b'\n') {
        end + 1
    } else {
        end
    };
    format!("{}{}", &text[..start], &text[end..])
}

fn parse_shell_api_key(line: &str) -> Option<(&str, String)> {
    let trimmed = line.trim();
    let assignment = trimmed.strip_prefix("export ").unwrap_or(trimmed);
    let (name, raw) = assignment.split_once('=')?;
    if !name.ends_with("_API_KEY") || !valid_name(name) {
        return None;
    }
    let value = if raw.starts_with('\'') {
        parse_quoted(raw, 0).ok()?
    } else if raw.starts_with('"') && raw.ends_with('"') {
        raw[1..raw.len() - 1].to_string()
    } else {
        raw.trim().to_string()
    };
    (!value.is_empty()).then_some((name, value))
}

fn parse_migratable_shell_api_key(line: &str) -> Option<(&str, String)> {
    let parsed = parse_shell_api_key(line)?;
    LEGACY_SHELL_API_KEYS.contains(&parsed.0).then_some(parsed)
}

fn unique_plan_id(plans: &BTreeMap<String, PlanRecord>, raw: &str) -> String {
    let mut base: String = raw
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() {
                ch.to_ascii_uppercase()
            } else {
                '_'
            }
        })
        .collect();
    while base.starts_with('_') {
        base.remove(0);
    }
    if base.is_empty() {
        base = "PLAN".to_string();
    }
    if !plans.contains_key(&base) {
        return base;
    }
    for index in 2.. {
        let candidate = format!("{base}_{index}");
        if !plans.contains_key(&candidate) {
            return candidate;
        }
    }
    unreachable!()
}

fn sanitize_id(raw: &str) -> String {
    let mut value: String = raw
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() {
                ch.to_ascii_uppercase()
            } else {
                '_'
            }
        })
        .collect();
    while value.starts_with('_') {
        value.remove(0);
    }
    if value.is_empty() {
        "PLAN".to_string()
    } else {
        value
    }
}

fn unique_group_id(groups: &BTreeMap<String, SubscriptionGroup>, raw: &str) -> String {
    let base = sanitize_id(raw);
    if !groups.contains_key(&base) {
        return base;
    }
    for index in 2.. {
        let candidate = format!("{base}_{index}");
        if !groups.contains_key(&candidate) {
            return candidate;
        }
    }
    unreachable!()
}

fn snapshot_files(paths: &[&PathBuf]) -> Result<Vec<FileSnapshot>, String> {
    paths
        .iter()
        .map(|path| {
            let bytes = path
                .exists()
                .then(|| fs::read(path).map_err(|error| error.to_string()))
                .transpose()?;
            let mode = path.exists().then(|| file_mode(path)).transpose()?;
            Ok(FileSnapshot {
                path: (*path).clone(),
                bytes,
                mode,
            })
        })
        .collect()
}

fn restore_snapshots(snapshots: &[FileSnapshot]) -> Vec<String> {
    let mut errors = Vec::new();
    for snapshot in snapshots.iter().rev() {
        let result = match &snapshot.bytes {
            Some(bytes) => fsx::atomic_write_bytes(&snapshot.path, bytes, snapshot.mode),
            None if snapshot.path.exists() => {
                fs::remove_file(&snapshot.path).map_err(|error| error.to_string())
            }
            None => Ok(()),
        };
        if let Err(error) = result {
            errors.push(format!("{}: {error}", snapshot.path.display()));
        }
    }
    errors
}

fn rollback_error(operation: &str, error: String, restore_errors: Vec<String>) -> String {
    if restore_errors.is_empty() {
        format!("{operation}失败，已恢复全部文件: {error}")
    } else {
        format!(
            "{operation}失败且回滚不完整: {error}；未恢复路径: {}",
            restore_errors.join("；")
        )
    }
}

#[cfg(unix)]
fn file_mode(path: &Path) -> Result<u32, String> {
    use std::os::unix::fs::PermissionsExt;
    fs::metadata(path)
        .map(|metadata| metadata.permissions().mode() & 0o777)
        .map_err(|error| format!("读取权限失败 {}: {error}", path.display()))
}

#[cfg(not(unix))]
fn file_mode(_path: &Path) -> Result<u32, String> {
    Ok(0o600)
}

#[cfg(unix)]
fn set_mode(path: &Path, mode: u32) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(path, fs::Permissions::from_mode(mode))
        .map_err(|error| format!("设置权限失败 {}: {error}", path.display()))
}

#[cfg(not(unix))]
fn set_mode(_path: &Path, _mode: u32) -> Result<(), String> {
    Ok(())
}

#[cfg(unix)]
fn check_private_permissions(directory: &Path, file: &Path) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    let directory_mode = fs::metadata(directory)
        .map_err(|error| error.to_string())?
        .permissions()
        .mode()
        & 0o777;
    let file_mode = fs::metadata(file)
        .map_err(|error| error.to_string())?
        .permissions()
        .mode()
        & 0o777;
    if directory_mode != 0o700 {
        return Err(format!(
            "环境订阅目录权限必须为 0700，当前为 {directory_mode:04o}"
        ));
    }
    if file_mode != 0o600 {
        return Err(format!(
            "环境订阅文件权限必须为 0600，当前为 {file_mode:04o}"
        ));
    }
    Ok(())
}

#[cfg(not(unix))]
fn check_private_permissions(_directory: &Path, _file: &Path) -> Result<(), String> {
    Ok(())
}

const LOADER_ZSH: &str = r#"# PlanDeck subscription loader. This file contains no credentials.
_pd_env_file="${XDG_CONFIG_HOME:-$HOME/.config}/ai-subscriptions/subscriptions.env"
[[ -r "$_pd_env_file" ]] || return 0
source "$_pd_env_file"

for _pd_selected_name in ${(k)parameters[(I)PLANDECK_GROUP_*_SELECTED]}; do
  _pd_group="${_pd_selected_name#PLANDECK_GROUP_}"
  _pd_group="${_pd_group%_SELECTED}"
  _pd_selected="${(P)_pd_selected_name}"
  _pd_key_name="PLANDECK_PLAN_${_pd_selected}_API_KEY"
  _pd_url_name="PLANDECK_GROUP_${_pd_group}_BASE_URL"
  _pd_model_name="PLANDECK_GROUP_${_pd_group}_MODEL"
  [[ -n "${(P)_pd_key_name}" ]] || continue
  export "PLANDECK_GROUP_${_pd_group}_API_KEY=${(P)_pd_key_name}"
  export "PLANDECK_GROUP_${_pd_group}_BASE_URL=${(P)_pd_url_name}"
  export "PLANDECK_GROUP_${_pd_group}_MODEL=${(P)_pd_model_name}"
done

for _pd_binding_name in ${(k)parameters[(I)PLANDECK_TOOL_*_GROUP]}; do
  _pd_tool="${_pd_binding_name#PLANDECK_TOOL_}"
  _pd_tool="${_pd_tool%_GROUP}"
  _pd_group="${(P)_pd_binding_name}"
  _pd_group_key="PLANDECK_GROUP_${_pd_group}_API_KEY"
  _pd_group_url="PLANDECK_GROUP_${_pd_group}_BASE_URL"
  _pd_group_model="PLANDECK_GROUP_${_pd_group}_MODEL"
  case "$_pd_tool" in
    CLAUDE)
      export "ANTHROPIC_AUTH_TOKEN=${(P)_pd_group_key}"
      export "ANTHROPIC_BASE_URL=${(P)_pd_group_url}"
      export "ANTHROPIC_MODEL=${(P)_pd_group_model}"
      ;;
    HERMES)
      _pd_provider_name="PLANDECK_GROUP_${_pd_group}_PROVIDER"
      if [[ "${(P)_pd_provider_name:l}" == *anthropic* ]]; then
        export "ANTHROPIC_API_KEY=${(P)_pd_group_key}"
      else
        export "OPENAI_API_KEY=${(P)_pd_group_key}"
      fi
      ;;
  esac
done

for _pd_secret_name in ${(k)parameters[(I)PLANDECK_PLAN_*_API_KEY]}; do
  unset "$_pd_secret_name"
done
unset _pd_env_file _pd_selected_name _pd_group _pd_selected _pd_key_name _pd_url_name _pd_model_name
unset _pd_binding_name _pd_tool _pd_group_key _pd_group_url _pd_group_model _pd_provider_name _pd_secret_name
"#;

const ENV_RUN_ZSH: &str = r#"#!/bin/zsh
source "${XDG_CONFIG_HOME:-$HOME/.config}/ai-subscriptions/load.zsh" || exit $?
exec "$@"
"#;

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    static COUNTER: AtomicU64 = AtomicU64::new(0);

    fn test_dir(label: &str) -> PathBuf {
        let id = COUNTER.fetch_add(1, Ordering::SeqCst);
        let path =
            std::env::temp_dir().join(format!("plandeck-env-{label}-{}-{id}", std::process::id()));
        fs::create_dir_all(&path).unwrap();
        path
    }

    fn valid_file() -> EnvironmentFile {
        let mut file = EnvironmentFile {
            version: VERSION.to_string(),
            ..EnvironmentFile::default()
        };
        file.plans.insert(
            "PRIMARY".to_string(),
            PlanRecord {
                name: "Primary".to_string(),
                provider: "openai-compatible".to_string(),
                base_url: "https://api.example.com/v1/".to_string(),
                models: vec!["model-a".to_string()],
                api_key: Some("fixture-secret".to_string()),
            },
        );
        file.groups.insert(
            "DEFAULT".to_string(),
            SubscriptionGroup {
                id: "DEFAULT".to_string(),
                provider: "openai-compatible".to_string(),
                base_url: "https://api.example.com/v1".to_string(),
                model: "model-a".to_string(),
                members: vec!["PRIMARY".to_string()],
                selected: "PRIMARY".to_string(),
            },
        );
        file
    }

    #[test]
    fn fingerprint_is_truncated_lowercase_sha256() {
        assert_eq!(fingerprint("secret"), "2bb80d537b1d");
    }

    #[test]
    fn parser_rejects_injection_duplicates_and_bad_arrays() {
        assert!(parse_environment("PLANDECK_ENV_VERSION=$(touch /tmp/nope)\n").is_err());
        assert!(parse_environment("PLANDECK_ENV_VERSION='1'\nPLANDECK_ENV_VERSION='1'\n").is_err());
        assert!(parse_environment("PLANDECK_PLAN_BAD_MODELS='nope'\n").is_err());
        assert!(parse_environment("OTHER_KEY='secret'\n").is_err());
    }

    #[test]
    fn writer_round_trips_quotes_and_redacts_view() {
        let mut file = valid_file();
        file.plans.get_mut("PRIMARY").unwrap().name = "Owner's plan".to_string();
        let text = serialize_environment(&file).unwrap();
        assert!(text.contains("Owner'\\''s plan"));
        let parsed = parse_environment(&text).unwrap();
        let view = to_view(&parsed, validate(&parsed));
        let json = serde_json::to_string(&view).unwrap();
        assert!(!json.contains("fixture-secret"));
        assert!(view.plans[0].has_credential);
    }

    #[cfg(unix)]
    #[test]
    fn store_enforces_private_modes_and_installs_independent_loader() {
        use std::os::unix::fs::PermissionsExt;
        let home = test_dir("home");
        let data = test_dir("data");
        let store = EnvironmentStore::new(home.to_str().unwrap(), data.to_str().unwrap());
        store.write_internal(&valid_file()).unwrap();
        assert_eq!(
            fs::metadata(store.directory())
                .unwrap()
                .permissions()
                .mode()
                & 0o777,
            0o700
        );
        assert_eq!(
            fs::metadata(store.path()).unwrap().permissions().mode() & 0o777,
            0o600
        );
        let result = store.install_loader().unwrap();
        assert_eq!(result.installed.len(), 3);
        let runner = home.join(".local/bin/ai-env-run");
        assert!(runner.exists());
        let output = std::process::Command::new("/bin/zsh")
            .arg("-c")
            .arg("source \"$HOME/.config/ai-subscriptions/load.zsh\"; print -r -- \"$PLANDECK_GROUP_DEFAULT_API_KEY|${PLANDECK_PLAN_PRIMARY_API_KEY-unset}\"")
            .env("HOME", &home)
            .env_remove("XDG_CONFIG_HOME")
            .output()
            .unwrap();
        assert!(output.status.success());
        assert_eq!(
            String::from_utf8(output.stdout).unwrap().trim(),
            "fixture-secret|unset"
        );
        let wrapped = std::process::Command::new(&runner)
            .args([
                "/bin/zsh",
                "-c",
                "print -r -- $PLANDECK_GROUP_DEFAULT_MODEL",
            ])
            .env("HOME", &home)
            .env_remove("XDG_CONFIG_HOME")
            .output()
            .unwrap();
        assert!(wrapped.status.success());
        assert_eq!(String::from_utf8(wrapped.stdout).unwrap().trim(), "model-a");
        fs::set_permissions(store.path(), fs::Permissions::from_mode(0o644)).unwrap();
        assert!(store.read().unwrap_err().contains("0600"));
    }

    #[test]
    fn migration_moves_catalog_and_zshrc_credentials_without_returning_them() {
        let home = test_dir("migration-home");
        let data = test_dir("migration-data");
        fs::write(
            data.join("catalog.json"),
            r#"{
  "version": 1,
  "plans": [{
    "id": "legacy",
    "name": "Legacy",
    "source": "config",
    "providerId": "openai-compatible",
    "baseUrl": "https://api.example.com/v1",
    "key": "catalog-fixture-secret",
    "models": ["model-a"]
  }]
}"#,
        )
        .unwrap();
        fs::write(
            home.join(".zshrc"),
            "export MINIMAX_API_KEY='shell-fixture-secret'\nexport UNRELATED_API_KEY='leave-me-alone'\nexport OTHER=value\n",
        )
        .unwrap();
        fs::create_dir_all(home.join(".codex")).unwrap();
        fs::write(home.join(".codex/config.toml"), "model = \"legacy\"\n").unwrap();
        fs::create_dir_all(home.join("Library/LaunchAgents")).unwrap();
        fs::write(
            home.join("Library/LaunchAgents/com.example.hermes.plist"),
            "fixture plist",
        )
        .unwrap();
        let store = EnvironmentStore::new(home.to_str().unwrap(), data.to_str().unwrap());
        assert_eq!(store.migration_preview().unwrap().candidate_plans, 2);
        let result = store.migrate_legacy().unwrap();
        assert_eq!(result.imported_plans, 2);
        assert_eq!(result.removed_catalog_keys, 1);
        assert_eq!(result.removed_shell_assignments, 1);
        assert!(!result.backups.is_empty());
        let catalog = fs::read_to_string(data.join("catalog.json")).unwrap();
        let zshrc = fs::read_to_string(home.join(".zshrc")).unwrap();
        let env = fs::read_to_string(store.path()).unwrap();
        assert!(!catalog.contains("catalog-fixture-secret"));
        assert!(!catalog.contains("\"key\""));
        assert!(!zshrc.contains("shell-fixture-secret"));
        assert!(zshrc.contains("UNRELATED_API_KEY='leave-me-alone'"));
        assert!(zshrc.contains("export OTHER=value"));
        assert!(env.contains("catalog-fixture-secret"));
        assert!(env.contains("shell-fixture-secret"));
        assert!(home.join(".config/ai-subscriptions/load.zsh").exists());
        assert!(home.join(".local/bin/ai-env-run").exists());
        assert!(fs::read_to_string(home.join(".zshenv"))
            .unwrap()
            .contains(SOURCE_START));
        assert!(result
            .backups
            .iter()
            .any(|path| path.ends_with("config.toml")));
        assert!(result
            .backups
            .iter()
            .any(|path| path.ends_with("com.example.hermes.plist")));
        let view = serde_json::to_string(&store.read().unwrap()).unwrap();
        assert!(!view.contains("fixture-secret"));
    }

    #[test]
    fn migration_rolls_back_every_changed_file_after_partial_failure() {
        let home = test_dir("rollback-home");
        let data = test_dir("rollback-data");
        let catalog_path = data.join("catalog.json");
        let zshrc_path = home.join(".zshrc");
        let zshenv_path = home.join(".zshenv");
        let catalog_before = r#"{"version":1,"plans":[{"id":"legacy","name":"Legacy","source":"config","providerId":"openai-compatible","baseUrl":"https://api.example.com/v1","key":"catalog-secret","models":["model-a"]}]}"#;
        let zshrc_before = "export MINIMAX_API_KEY='shell-secret'\n";
        let zshenv_before = "export EXISTING=value\n";
        fs::write(&catalog_path, catalog_before).unwrap();
        fs::write(&zshrc_path, zshrc_before).unwrap();
        fs::write(&zshenv_path, zshenv_before).unwrap();

        let store = EnvironmentStore::new(home.to_str().unwrap(), data.to_str().unwrap());
        let error = store.migrate_legacy_inner(Some("loader")).unwrap_err();
        assert!(error.contains("已恢复全部文件"));
        assert_eq!(fs::read_to_string(catalog_path).unwrap(), catalog_before);
        assert_eq!(fs::read_to_string(zshrc_path).unwrap(), zshrc_before);
        assert_eq!(fs::read_to_string(zshenv_path).unwrap(), zshenv_before);
        assert!(!store.path().exists());
        assert!(!home.join(".config/ai-subscriptions/load.zsh").exists());
        assert!(!home.join(".local/bin/ai-env-run").exists());
        assert!(!fs::read_dir(store.directory()).unwrap().any(|entry| entry
            .unwrap()
            .file_name()
            .to_string_lossy()
            .contains("validation")));
    }
}
