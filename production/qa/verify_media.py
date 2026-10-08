#!/usr/bin/env python3
from pathlib import Path
import subprocess,json,sys,hashlib,time
ROOT=Path(__file__).resolve().parents[1]
paths=[Path(x) for x in sys.argv[1:]]
if not paths:paths=[ROOT/'output/game_theory_v2_pvz_1080p.mp4',ROOT/'output/game_theory_v2_pvz_4k_optional.mp4']
reports=[]
for p in paths:
    info=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(p)]))
    video=next(x for x in info['streams'] if x['codec_type']=='video');audio=[x for x in info['streams'] if x['codec_type']=='audio']
    assert video['codec_name']=='h264';assert video['r_frame_rate']=='30/1';assert int(video['nb_frames'])==5199;assert abs(float(info['format']['duration'])-173.3)<.06
    assert video['pix_fmt']=='yuv420p';assert all(video[x]=='bt709' for x in ['color_space','color_primaries','color_transfer'])
    a=time.time();run=subprocess.run(['ffmpeg','-v','error','-i',str(p),'-progress','pipe:1','-f','null','-'],capture_output=True,text=True);assert run.returncode==0,run.stderr;assert not run.stderr.strip(),run.stderr
    frames=[int(x.split('=')[1]) for x in run.stdout.splitlines() if x.startswith('frame=')];assert frames[-1]==5199
    reports.append({'file':p.name,'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'video':{k:video.get(k) for k in ['codec_name','profile','level','width','height','sample_aspect_ratio','pix_fmt','r_frame_rate','duration','nb_frames','color_space','color_transfer','color_primaries']},'audio_tracks':len(audio),'audio_codecs':[x['codec_name'] for x in audio],'full_decode':{'status':'passed','frames':frames[-1],'stderr':'','elapsed_seconds':round(time.time()-a,2)}})
    print(p.name,video['width'],video['height'],len(audio),'audio tracks: decode passed')
for r in reports:(ROOT/'qa'/('media_'+r['file']+'.json')).write_text(json.dumps(r,ensure_ascii=False,indent=2))
