"""Stage every UTF-8 text product before replacing any existing product."""
from pathlib import Path
import os
import tempfile


def write_products(directory, products):
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='.narration-', dir=directory) as temporary:
        staged = Path(temporary)
        for name, text in products.items():
            relative = Path(name)
            if relative.is_absolute() or '..' in relative.parts:
                raise ValueError('Product path must stay inside the output directory')
            target = staged / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(text, encoding='utf-8', newline='\n')
        for name in products:
            target = directory / name
            target.parent.mkdir(parents=True, exist_ok=True)
            os.replace(staged / name, target)
