use std::path::Path;

pub fn size(path: &Path) -> u64 {
    let Ok(meta) = std::fs::symlink_metadata(path) else {
        return 0;
    };
    if !meta.is_dir() {
        return meta.len();
    }
    std::fs::read_dir(path)
        .into_iter()
        .flatten()
        .flatten()
        .map(|e| size(&e.path()))
        .sum()
}

/// Removes a file or a directory tree and returns the bytes that were in it.
pub fn remove_counted(path: &Path) -> u64 {
    let bytes = size(path);
    let gone = if std::fs::symlink_metadata(path).is_ok_and(|m| m.is_dir()) {
        std::fs::remove_dir_all(path)
    } else {
        std::fs::remove_file(path)
    };
    if gone.is_ok() { bytes } else { 0 }
}
