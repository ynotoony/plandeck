use std::fs;
use std::path::{Path, PathBuf};

use chrono::Local;
use serde::{Deserialize, Serialize};

const MANIFEST_NAME: &str = ".manifest.json";

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupRecord {
    pub id: String,
    pub tool_id: String,
    pub created_at: String,
    pub original_path: String,
    pub backup_path: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupTarget {
    pub tool_id: String,
    pub path: String,
}

#[derive(Default, Deserialize, Serialize)]
struct BackupManifest {
    entries: Vec<BackupRecord>,
}

pub fn atomic_write(path: &Path, text: &str, mode: Option<u32>) -> Result<(), String> {
    atomic_write_bytes(path, text.as_bytes(), mode)
}

fn atomic_write_bytes(path: &Path, bytes: &[u8], mode: Option<u32>) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("创建目录失败 {}: {e}", parent.display()))?;
    }
    let tmp = PathBuf::from({
        let mut s = path.as_os_str().to_owned();
        s.push(".tmp");
        s
    });
    fs::write(&tmp, bytes).map_err(|e| format!("写入失败 {}: {e}", tmp.display()))?;
    let write_mode = mode.or_else(|| fs::metadata(path).ok().map(|metadata| file_mode(&metadata)));
    if let Some(mode) = write_mode {
        set_mode(&tmp, mode)?;
    }
    fs::rename(&tmp, path)
        .map_err(|e| format!("重命名失败 {} -> {}: {e}", tmp.display(), path.display()))?;
    Ok(())
}

#[cfg(unix)]
fn file_mode(metadata: &fs::Metadata) -> u32 {
    use std::os::unix::fs::PermissionsExt;
    metadata.permissions().mode() & 0o777
}

#[cfg(not(unix))]
fn file_mode(_metadata: &fs::Metadata) -> u32 {
    0o600
}

#[cfg(unix)]
fn set_mode(path: &Path, mode: u32) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(path, fs::Permissions::from_mode(mode))
        .map_err(|e| format!("设置权限失败 {}: {e}", path.display()))
}

#[cfg(not(unix))]
fn set_mode(_path: &Path, _mode: u32) -> Result<(), String> {
    Ok(())
}

/// 把 paths 中存在的文件复制到 `<data_dir>/backups/<timestamp>/`，返回备份目标路径。
/// 同一次调用共享一个时间戳目录；目标重名时追加 `-1`、`-2`。
pub fn backup_files(
    data_dir: &Path,
    tool_id: &str,
    paths: &[String],
) -> Result<Vec<PathBuf>, String> {
    let stamp = Local::now().format("%Y-%m-%dT%H-%M-%S");
    let dir = data_dir.join("backups").join(stamp.to_string());
    let created_at = Local::now().to_rfc3339();
    let mut saved = Vec::new();
    let mut records = Vec::new();
    for p in paths {
        let src = Path::new(p);
        if !src.exists() {
            continue;
        }
        if !dir.exists() {
            fs::create_dir_all(&dir)
                .map_err(|e| format!("创建备份目录失败 {}: {e}", dir.display()))?;
        }
        let name = src
            .file_name()
            .ok_or_else(|| format!("无法取文件名: {p}"))?
            .to_string_lossy();
        let dest = unique_dest(&dir, &name);
        fs::copy(src, &dest).map_err(|e| format!("备份失败 {p} -> {}: {e}", dest.display()))?;
        let name = dest.file_name().unwrap().to_string_lossy().into_owned();
        records.push(BackupRecord {
            id: format!("{stamp}/{name}"),
            tool_id: tool_id.to_string(),
            created_at: created_at.clone(),
            original_path: p.clone(),
            backup_path: dest.to_string_lossy().into_owned(),
        });
        saved.push(dest);
    }
    if !records.is_empty() {
        let manifest_path = dir.join(MANIFEST_NAME);
        let mut manifest = read_manifest(&manifest_path)?;
        manifest.entries.extend(records);
        let text = serde_json::to_string_pretty(&manifest)
            .map_err(|e| format!("序列化备份索引失败: {e}"))?;
        atomic_write(&manifest_path, &text, Some(0o600))?;
    }
    Ok(saved)
}

pub fn list_backups(
    data_dir: &Path,
    targets: &[BackupTarget],
) -> Result<Vec<BackupRecord>, String> {
    let root = data_dir.join("backups");
    if !root.exists() {
        return Ok(Vec::new());
    }
    let mut records = Vec::new();
    for entry in
        fs::read_dir(&root).map_err(|e| format!("读取备份目录失败 {}: {e}", root.display()))?
    {
        let path = entry
            .map_err(|e| format!("读取备份目录项失败: {e}"))?
            .path();
        if !path.is_dir() {
            continue;
        }
        let manifest_path = path.join(MANIFEST_NAME);
        if manifest_path.exists() {
            match read_manifest(&manifest_path) {
                Ok(manifest) => records.extend(manifest.entries),
                Err(_) => records.extend(legacy_records(&path, targets)?),
            }
        } else {
            records.extend(legacy_records(&path, targets)?);
        }
    }
    records.retain(|record| Path::new(&record.backup_path).is_file());
    records.sort_by(|a, b| {
        b.created_at
            .cmp(&a.created_at)
            .then_with(|| b.id.cmp(&a.id))
    });
    Ok(records)
}

pub fn restore_backup(
    data_dir: &Path,
    targets: &[BackupTarget],
    id: &str,
) -> Result<Vec<PathBuf>, String> {
    let record = list_backups(data_dir, targets)?
        .into_iter()
        .find(|record| record.id == id)
        .ok_or_else(|| format!("备份不存在: {id}"))?;
    let current = backup_files(
        data_dir,
        &record.tool_id,
        std::slice::from_ref(&record.original_path),
    )?;
    let bytes = fs::read(&record.backup_path)
        .map_err(|e| format!("读取备份失败 {}: {e}", record.backup_path))?;
    let mode = fs::metadata(&record.backup_path)
        .map(|metadata| file_mode(&metadata))
        .map_err(|e| format!("读取备份权限失败 {}: {e}", record.backup_path))?;
    atomic_write_bytes(Path::new(&record.original_path), &bytes, Some(mode))?;
    Ok(current)
}

fn legacy_records(dir: &Path, targets: &[BackupTarget]) -> Result<Vec<BackupRecord>, String> {
    let stamp = dir
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or_default();
    let created_at = chrono::NaiveDateTime::parse_from_str(stamp, "%Y-%m-%dT%H-%M-%S")
        .ok()
        .and_then(|date| date.and_local_timezone(Local).single())
        .map(|date| date.to_rfc3339())
        .unwrap_or_else(|| stamp.to_string());
    let mut records = Vec::new();
    for entry in
        fs::read_dir(dir).map_err(|e| format!("读取备份目录失败 {}: {e}", dir.display()))?
    {
        let backup_path = entry
            .map_err(|e| format!("读取备份目录项失败: {e}"))?
            .path();
        if !backup_path.is_file()
            || backup_path.file_name().and_then(|n| n.to_str()) == Some(MANIFEST_NAME)
        {
            continue;
        }
        let name = backup_path.file_name().unwrap();
        let matches: Vec<&BackupTarget> = targets
            .iter()
            .filter(|target| Path::new(&target.path).file_name() == Some(name))
            .collect();
        if let [target] = matches.as_slice() {
            records.push(BackupRecord {
                id: format!("{stamp}/{}", name.to_string_lossy()),
                tool_id: target.tool_id.clone(),
                created_at: created_at.clone(),
                original_path: target.path.clone(),
                backup_path: backup_path.to_string_lossy().into_owned(),
            });
        }
    }
    Ok(records)
}

fn read_manifest(path: &Path) -> Result<BackupManifest, String> {
    if !path.exists() {
        return Ok(BackupManifest::default());
    }
    let text = fs::read_to_string(path)
        .map_err(|e| format!("读取备份索引失败 {}: {e}", path.display()))?;
    serde_json::from_str(&text).map_err(|e| format!("解析备份索引失败 {}: {e}", path.display()))
}

fn unique_dest(dir: &Path, name: &str) -> PathBuf {
    let candidate = dir.join(name);
    if !candidate.exists() {
        return candidate;
    }
    let (stem, ext) = split_name(name);
    for i in 1u32.. {
        let candidate = dir.join(format!("{stem}-{i}{ext}"));
        if !candidate.exists() {
            return candidate;
        }
    }
    unreachable!()
}

fn split_name(name: &str) -> (&str, &str) {
    match name.rfind('.') {
        Some(i) if i > 0 => (&name[..i], &name[i..]),
        _ => (name, ""),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    static COUNTER: AtomicU64 = AtomicU64::new(0);

    fn test_dir(label: &str) -> PathBuf {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let n = COUNTER.fetch_add(1, Ordering::SeqCst);
        let dir = std::env::temp_dir().join(format!("plandeck-rs-{label}-{nanos}-{n}"));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn atomic_write_creates_parents_and_content() {
        let dir = test_dir("write");
        let path = dir.join("a/b/config.yaml");
        atomic_write(&path, "model: {}\n", None).unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), "model: {}\n");
        assert!(!dir.join("a/b/config.yaml.tmp").exists());
    }

    #[test]
    fn atomic_write_overwrites_existing() {
        let dir = test_dir("overwrite");
        let path = dir.join("config.yaml");
        atomic_write(&path, "old", None).unwrap();
        atomic_write(&path, "new", None).unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), "new");
    }

    #[cfg(unix)]
    #[test]
    fn atomic_write_applies_mode() {
        use std::os::unix::fs::PermissionsExt;
        let dir = test_dir("mode");
        let path = dir.join("catalog.json");
        atomic_write(&path, "{}", Some(0o600)).unwrap();
        let mode = fs::metadata(&path).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode, 0o600);
    }

    #[cfg(unix)]
    #[test]
    fn atomic_write_preserves_existing_mode() {
        use std::os::unix::fs::PermissionsExt;
        let dir = test_dir("preserve-mode");
        let path = dir.join("config.yaml");
        fs::write(&path, "old").unwrap();
        fs::set_permissions(&path, fs::Permissions::from_mode(0o600)).unwrap();

        atomic_write(&path, "new", None).unwrap();

        let mode = fs::metadata(&path).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode, 0o600);
    }

    #[test]
    fn backup_copies_into_timestamped_dir() {
        let data = test_dir("data");
        let src_dir = test_dir("src");
        let src = src_dir.join("config.yaml");
        fs::write(&src, "model: x\n").unwrap();

        let saved = backup_files(&data, "hermes", &[src.to_string_lossy().into_owned()]).unwrap();

        assert_eq!(saved.len(), 1);
        let dest = &saved[0];
        assert!(dest.starts_with(data.join("backups")), "{}", dest.display());
        assert_eq!(dest.file_name().unwrap(), "config.yaml");
        assert_eq!(fs::read_to_string(dest).unwrap(), "model: x\n");
        // backups/<timestamp>/ 一层时间戳目录：YYYY-MM-DDTHH-MM-SS
        let stamp = dest
            .parent()
            .unwrap()
            .file_name()
            .unwrap()
            .to_string_lossy()
            .into_owned();
        assert_eq!(stamp.len(), 19);
        assert!(stamp.contains('T'));
    }

    #[test]
    fn backup_skips_missing_files() {
        let data = test_dir("data-missing");
        let saved = backup_files(
            &data,
            "hermes",
            &[data.join("nope.yaml").to_string_lossy().into_owned()],
        )
        .unwrap();
        assert!(saved.is_empty());
        assert!(!data.join("backups").exists());
    }

    #[test]
    fn backup_dedupes_same_basename() {
        let data = test_dir("data-dup");
        let a = test_dir("dup-a");
        let b = test_dir("dup-b");
        let fa = a.join("config.yaml");
        let fb = b.join("config.yaml");
        fs::write(&fa, "A").unwrap();
        fs::write(&fb, "B").unwrap();

        let saved = backup_files(
            &data,
            "hermes",
            &[
                fa.to_string_lossy().into_owned(),
                fb.to_string_lossy().into_owned(),
            ],
        )
        .unwrap();

        assert_eq!(saved.len(), 2);
        let names: Vec<String> = saved
            .iter()
            .map(|p| p.file_name().unwrap().to_string_lossy().into_owned())
            .collect();
        assert!(names.contains(&"config.yaml".to_string()));
        assert!(names.contains(&"config-1.yaml".to_string()));
        assert_eq!(saved[0].parent(), saved[1].parent());
    }

    #[test]
    fn lists_backups_newest_first_with_metadata() {
        let data = test_dir("list");
        let src = test_dir("list-src").join("config.yaml");
        fs::write(&src, "old").unwrap();
        backup_files(&data, "hermes", &[src.to_string_lossy().into_owned()]).unwrap();

        let records = list_backups(&data, &[]).unwrap();

        assert_eq!(records.len(), 1);
        assert_eq!(records[0].tool_id, "hermes");
        assert_eq!(records[0].original_path, src.to_string_lossy());
        assert!(records[0].id.ends_with("/config.yaml"));
    }

    #[test]
    fn restore_backs_up_current_file_then_restores_old_content() {
        let data = test_dir("restore");
        let src = test_dir("restore-src").join("config.yaml");
        fs::write(&src, "old").unwrap();
        backup_files(&data, "hermes", &[src.to_string_lossy().into_owned()]).unwrap();
        let original_backup = list_backups(&data, &[]).unwrap().remove(0);
        fs::write(&src, "current").unwrap();

        let safety = restore_backup(&data, &[], &original_backup.id).unwrap();

        assert_eq!(fs::read_to_string(&src).unwrap(), "old");
        assert_eq!(safety.len(), 1);
        assert_eq!(fs::read_to_string(&safety[0]).unwrap(), "current");
        assert_eq!(list_backups(&data, &[]).unwrap().len(), 2);
    }

    #[test]
    fn lists_legacy_backup_when_target_is_unambiguous() {
        let data = test_dir("legacy");
        let dir = data.join("backups/2026-08-12T12-34-56");
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("config.yaml"), "old").unwrap();
        let target = BackupTarget {
            tool_id: "hermes".into(),
            path: "/home/test/.hermes/config.yaml".into(),
        };

        let records = list_backups(&data, &[target]).unwrap();

        assert_eq!(records.len(), 1);
        assert_eq!(records[0].tool_id, "hermes");
        assert_eq!(records[0].original_path, "/home/test/.hermes/config.yaml");
    }

    #[test]
    fn malformed_manifest_does_not_hide_other_backups() {
        let data = test_dir("malformed");
        let bad = data.join("backups/2026-08-12T12-34-56");
        fs::create_dir_all(&bad).unwrap();
        fs::write(bad.join(MANIFEST_NAME), "not json").unwrap();
        let src = test_dir("malformed-src").join("settings.json");
        fs::write(&src, "valid").unwrap();
        backup_files(&data, "claude", &[src.to_string_lossy().into_owned()]).unwrap();

        let records = list_backups(&data, &[]).unwrap();

        assert_eq!(records.len(), 1);
        assert_eq!(records[0].tool_id, "claude");
    }
}
