"""Publish UTF-8 text or byte products with rollback on ordinary filesystem failures.

Each replacement is atomic, but the set is NOT atomic to concurrent readers and
is not crash/power-loss durable. Callers must exclude concurrent writers. A
second filesystem failure during rollback is reported and recovery backups are
retained; no implementation can promise restoration on an unavailable device.
"""
from pathlib import Path
import os
import shutil
import stat
import tempfile


def write_products(directory, products):
    directory = Path(directory).absolute()
    entries = []
    for name, text in products.items():
        relative = Path(name)
        if relative.is_absolute() or '..' in relative.parts or not relative.parts:
            raise ValueError('Product path must stay inside the output directory')
        if any(relative == old or relative in old.parents or old in relative.parents
               for old, _ in entries):
            raise ValueError('Product paths must be distinct and must not overlap')
        entries.append((relative, text))
    if not entries:
        return

    created_directories = []
    temporary = None
    published = []
    backups = {}
    keep_backups = False

    def ensure_directory(path):
        if path.is_symlink():
            raise ValueError(f'Output directories must not be symbolic links: {path}')
        if path.exists():
            if not path.is_dir():
                raise NotADirectoryError(str(path))
            return
        ensure_directory(path.parent)
        path.mkdir()
        created_directories.append(path)

    try:
        # Check every path before replacing any product. Never replace a directory,
        # symlink or special file, even if the platform permits its replacement.
        ensure_directory(directory)
        for relative, _ in entries:
            target = directory / relative
            parent = directory
            for part in relative.parts[:-1]:
                parent /= part
                ensure_directory(parent)
            if target.is_symlink():
                raise ValueError(f'Output products must not be symbolic links: {target}')
            if target.exists() and not stat.S_ISREG(target.stat().st_mode):
                raise ValueError(f'Output product must be a regular file: {target}')
        # A real create/remove probe checks parent-directory permissions (a
        # read-only regular file itself may legitimately be replaced on POSIX).
        for parent in { (directory / relative).parent for relative, _ in entries }:
            with tempfile.TemporaryFile(dir=parent):
                pass
        temporary = Path(tempfile.mkdtemp(prefix='.narration-', dir=directory))
        staged = temporary / 'new'
        saved = temporary / 'old'
        for relative, text in entries:
            target = staged / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            if isinstance(text, bytes):
                target.write_bytes(text)
            else:
                target.write_text(text, encoding='utf-8', newline='\n')
            original = directory / relative
            if original.exists():
                backup = saved / relative
                backup.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(original, backup)
                backups[relative] = backup
        for relative, _ in entries:
            os.replace(staged / relative, directory / relative)
            published.append(relative)
    except BaseException as failure:
        rollback_errors = []
        for relative in reversed(published):
            try:
                if relative in backups:
                    os.replace(backups[relative], directory / relative)
                else:
                    (directory / relative).unlink()
            except OSError as error:
                rollback_errors.append(f'{relative}: {error}')
        if rollback_errors:
            keep_backups = True
            raise RuntimeError('Publication failed and rollback was incomplete; '
                               f'recovery files retained at {temporary}: '
                               + '; '.join(rollback_errors)) from failure
        raise
    finally:
        if temporary is not None and not keep_backups:
            shutil.rmtree(temporary)
        # On failure, remove only empty directories created by this invocation.
        # Successful publications keep their directories; unrelated files survive.
        if not keep_backups:
            for path in reversed(created_directories):
                try:
                    path.rmdir()
                except OSError:
                    pass
