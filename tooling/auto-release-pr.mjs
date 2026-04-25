const checkedAutoReleasePattern = /-\s*\[[xX]\]\s*Auto release/;

export function hasChangesetFile(files) {
  return files.some((file) => {
    const filename = typeof file === 'string' ? file : file.filename;

    return (
      filename?.startsWith('.changeset/') &&
      filename.endsWith('.md') &&
      filename !== '.changeset/README.md'
    );
  });
}

export function isAutoReleaseChecked(body = '') {
  return checkedAutoReleasePattern.test(body);
}
