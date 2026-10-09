"""Original two-block teaching fixture. Edit rows, then rebuild and review the text."""
from pathlib import Path
import argparse
import json
import sys

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'scripts'))
from narration_io import write_products
from case_data import Case
from text_contract import readable_count
case = Case(ROOT)

sys.stdout.reconfigure(encoding='utf-8')
parser = argparse.ArgumentParser()
parser.add_argument('--output-dir', type=Path, default=Path(__file__).resolve().parent)
out = parser.parse_args().output_dir
config = json.loads((Path(__file__).resolve().parents[1] / 'chapter.json').read_text(encoding='utf-8'))
rows = [
    ('s01_choices', case.text('两位参与者，各选红牌或蓝牌。'), 3.6, 0.8,
     {'action': 'show_two_actions'}),
    ('s02_scores', case.score_text('RR'), 3.6, 1.0,
     {'action': 'reveal_scores', 'matrix_cell': 'RR', 'scores': case.values['RR'],
      'score_reveals': [{'offset': 2.8, 'player': 'A', 'value': case.values['RR'][0]}, {'offset': 2.8, 'player': 'B', 'value': case.values['RR'][1]}]}),
]
segments = []
time = 0.0
for key, text, spoken, pause, cue in rows:
    if not case.is_original:
        spoken = max(spoken, round(readable_count(text) / 3.8, 1))
    voiceover_end = round(time + spoken, 3)
    end = round(voiceover_end + pause, 3)
    lines = case.lines(text, cue)
    segments.append({'id': key, 'section': 'example', 'text': '\n'.join(lines), 'voiceover': text,
                     'spoken_duration': spoken, 'pause_after': pause, 'lines': lines,
                     'visual_cue': cue, 'breath_points': [], 'start': time,
                     'voiceover_end': voiceover_end, 'end': end,
                     'display_duration': round(end-time, 3), 'speech_plan_note': '人工口播参考，录音后再对齐。'})
    time = end
timeline = {
    'schema_version': '2.1', 'title': config['title'], 'language': 'zh-CN',
    'duration': time, 'fps_reference': 30,
    'timing_status': 'manual_voiceover_reference_not_audio_aligned',
    'timing_notice': '原创几何占位测试内容，没有音轨，尚未音频对齐。',
    'speech_guidance': {'subtitle_policy': '整句显示，尾停包含在显示窗内。'},
    'visual_contract': {'participants': case.players, 'game_rounds': 1,
                        'matrix_score_order': case.players, 'matrix_values': case.values},
    'sections': [{'id': 'example', 'title': config['title'], 'start': 0, 'end': time}],
    'segments': segments,
}

def timestamp(seconds):
    total = round(seconds * 1000)
    hours, total = divmod(total, 3600000)
    minutes, total = divmod(total, 60000)
    seconds, milliseconds = divmod(total, 1000)
    return f'{hours:02d}:{minutes:02d}:{seconds:02d},{milliseconds:03d}'

srt = '\n\n'.join(f"{i}\n{timestamp(s['start'])} --> {timestamp(s['end'])}\n{s['text']}"
                  for i, s in enumerate(segments, 1)) + '\n'
voiceover = config['title'] + '｜人工口播参考（未音频对齐）\n\n' + '\n\n'.join(
    f"{s['voiceover']}\n[尾停约{s['pause_after']:.1f}秒，已包含在显示窗内]" for s in segments) + '\n'
write_products(out, {'timeline.json': json.dumps(timeline, ensure_ascii=False, indent=2) + '\n',
                     'game_theory_v2_zh.srt': srt, 'voiceover_v2_zh.txt': voiceover})
print(f"Built original prototype: {config['id']}, {time}s")
