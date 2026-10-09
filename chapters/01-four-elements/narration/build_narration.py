from pathlib import Path
import argparse,json,sys
sys.path.insert(0,str(Path(__file__).resolve().parents[3]/'scripts'))
from narration_io import write_products
from case_data import Case
from text_contract import readable_count
CASE=Case(Path(__file__).resolve().parents[3])
PAYOFFS=CASE.values
sys.stdout.reconfigure(encoding='utf-8')
parser=argparse.ArgumentParser(description='Rebuild the authored chapter; QA can use a temporary output directory.')
parser.add_argument('--output-dir',type=Path,default=Path(__file__).resolve().parent)
OUT=parser.parse_args().output_dir
OUT.mkdir(parents=True,exist_ok=True)
# Speech estimates are authored per semantic unit; they are not character-rate allocation.
# Only revised text is re-estimated; unchanged original reference windows stay fixed.
def revised_speech(text,previous):
    return max(previous,round(readable_count(text)/3.8,1))
rows=[]
def add(section,key,text,spoken_duration,pause,lines=None,cue=None,breaths=None):
    text=CASE.score_text(cue['matrix_cell']) if cue and cue.get('action')=='reveal_scores' else CASE.text(text)
    adapted_cue=CASE.cue(cue or {})
    lines=[CASE.text(line) for line in lines] if lines else CASE.lines(text, adapted_cue)
    if any(readable_count(line)>22 for line in lines):lines=CASE.lines(text, adapted_cue)
    CASE.validate_lines(lines, text, adapted_cue)
    if not CASE.is_original:spoken_duration=max(spoken_duration,round(readable_count(text)/3.8,1))
    breaths=[CASE.text(breath) for breath in (breaths or []) if CASE.text(breath) in text]
    rows.append(dict(section=section,key=key,text=text,voiceover=text,spoken_duration=spoken_duration,pause_after=pause,lines=lines,visual_cue=adapted_cue,breath_points=breaths))
add('intro','hook','两个人都想多拿分，为什么还得琢磨对方怎么选？',5.7,.8,['两个人都想多拿分，','为什么还得琢磨对方怎么选？'],{'action':'show_shared_game','note':'同一桌面、同一对角色和红蓝牌；第一句不抢先解释。'},['多拿分，'])
add('intro','four_questions','看懂一场博弈，先问四个问题。',3.9,.8,cue={'action':'introduce_four_questions','note':'四个卡片有序出现，仅突出总标题。'},breaths=['一场博弈，'])
add('players','question','第一，谁在做决定？',2.5,.7,cue={'action':'focus_question','question':1})
add('players','setup','假设小A和小B，玩一轮积分游戏。',4.2,.6,cue={'action':'introduce_players','note':'标注小A、小B；本片：一轮游戏。'},breaths=['小B，'])
add('players','goal','他们各自选牌，都希望自己的得分更高。',4.5,.6,cue={'action':'show_individual_goals','note':'两个角色各自的得分目标，避免看成团队积分。'},breaths=['各自选牌，'])
add('players','definition','认识参与者，要弄清谁能决定，以及他们在乎什么。',5.6,.9,['认识参与者，要弄清谁能决定，','以及他们在乎什么。'],{'action':'define_players','note':'参与者不只表示人数；谁决定、在乎什么依次强调。'},['参与者，','谁能决定，'])
add('information','question','第二，做决定时，知道什么？',3.0,.8,cue={'action':'focus_question','question':2},breaths=['做决定时，'])
add('information','known_unknown','两人都知道计分规则，但看不到对方这次选的牌。',5.6,.8,['两人都知道计分规则，','但看不到对方这次选的牌。'],{'action':'show_public_rules_hidden_choices','note':'规则公开，当前选牌遮挡；不要标成“不完全信息”。'},['计分规则，'])
add('information','simultaneous','他们各自选好，再一起亮牌。',3.5,.6,cue={'action':'choose_then_reveal_together','note':'两个动作分开，不结算得分。'},breaths=['各自选好，'])
add('information','distinction','知道规则，不等于知道对方这次出什么。',4.8,.9,cue={'action':'contrast_rule_and_current_choice','note':'画面可以用≠，口播读“不等于”。'},breaths=['知道规则，'])
add('information','timing','谁先行动，能看到什么，也要交代清楚。',4.4,.9,cue={'action':'summarize_information','note':'行动顺序和可见信息作为两项清晰标签。'},breaths=['谁先行动，','能看到什么，'])
add('strategy','question','第三，能怎样选择？',2.3,.7,cue={'action':'focus_question','question':3})
add('strategy','options','这一轮，每人都可以选红牌，或者蓝牌。',4.6,.6,cue={'action':'show_two_actions','note':'同一角色的红、蓝牌上都保留文字。'},breaths=['这一轮，','选红牌，'])
add('strategy','simple_case','这里只有一次选择，红和蓝就是两个纯策略。',4.8,.9,['这里只有一次选择，','红和蓝就是两个纯策略。'],{'action':'map_actions_to_pure_strategies','note':'固定显示“本例：单次决策”，不把一般策略等同于一个动作。'},['一次选择，'])
add('strategy','definition','一般来说，策略是一整套应对计划。',4.0,1.1,cue={'action':'define_strategy','note':'定义完整显示，读完后留一秒消化。'},breaths=['一般来说，'])
add('strategy','comparison_intro','比如，如果改成多轮：',2.7,.6,cue={'action':'open_multi_round_comparison','note':'明确标题“如果改成多轮：概念对照”。'})
add('strategy','comparison_example','第一轮选红；以后，跟着对方上一轮的牌选。',5.0,.9,['第一轮选红；','以后，跟着对方上一轮的牌选。'],{'action':'show_multi_round_plan','note':'先显示第一轮红，再显示后续轮根据对手上一轮选牌；不结算、不分析重复博弈。'},['第一轮选红；','以后，'])
add('strategy','return_single_round','这是一套跨轮次的计划。本片仍然只玩一轮。',4.8,1.0,['这是一套跨轮次的计划。','本片仍然只玩一轮。'],{'action':'return_to_single_round','note':'从对照插页回原桌面，固定“本片：一轮游戏”。'},['计划。'])
add('payoffs','question','第四，不同选择，各得多少分？',3.5,.8,cue={'action':'focus_question','question':4},breaths=['不同选择，'])
add('payoffs','definition','这就是收益，也叫支付。',2.8,1.0,cue={'action':'define_payoff','note':'只出现收益（支付）一个概念，不叠加效用/函数术语。'},breaths=['收益，'])
add('payoffs','rows','看这张表：行，是小A的选择。',3.8,.7,cue={'action':'introduce_matrix_rows','note':'只突出行标签小A及红、蓝，不亮数值。'},breaths=['看这张表：','行，'])
add('payoffs','columns','列，是小B的选择。',2.5,.7,cue={'action':'introduce_matrix_columns','note':'只突出列标签小B及红、蓝，不亮数值。'},breaths=['列，'])
add('payoffs','score_order','每格先读小A的得分，再读小B的得分。',4.5,.9,['每格先读小A的得分，','再读小B的得分。'],{'action':'introduce_score_order','note':'常驻“（小A得分，小B得分）”；文字与人物颜色一致。'},['小A的得分，'])
add('payoffs','rr_select','小A选红，小B也选红。',3.5,.6,cue={'action':'highlight_choices','matrix_cell':'RR','choices':{'A':'红','B':'红'},'note':'先沿行列找到交点，格内数字暂不出现。'},breaths=['小A选红，'])
add('payoffs','rr_score',CASE.score_text('RR'),2.5,.9,cue={'action':'reveal_scores','matrix_cell':'RR','scores':PAYOFFS['RR'],'score_reveals':[{'offset':1.8,'player':'A','value':PAYOFFS['RR'][0]},{'offset':1.8,'player':'B','value':PAYOFFS['RR'][1]}],'note':'两者同时得三分；固定数对（3，3）。'},breaths=['两个人，'])
add('payoffs','rb_select','小A选红，小B选蓝。',3.3,.6,cue={'action':'highlight_choices','matrix_cell':'RB','choices':{'A':'红','B':'蓝'},'note':'先选择，再结算；不可交换收益数对。'},breaths=['小A选红，'])
add('payoffs','rb_score',CASE.score_text('RB'),3.8,.9,cue={'action':'reveal_scores','matrix_cell':'RB','scores':PAYOFFS['RB'],'score_reveals':[{'offset':1.0,'player':'A','value':PAYOFFS['RB'][0]},{'offset':3.0,'player':'B','value':PAYOFFS['RB'][1]}],'note':'依次显出A零、B五；固定数对（0，5）。'},breaths=['小A得零分，'])
add('payoffs','br_select','小A选蓝，小B选红。',3.3,.6,cue={'action':'highlight_choices','matrix_cell':'BR','choices':{'A':'蓝','B':'红'},'note':'先选择，再结算。'},breaths=['小A选蓝，'])
add('payoffs','br_score',CASE.score_text('BR'),3.8,.9,cue={'action':'reveal_scores','matrix_cell':'BR','scores':PAYOFFS['BR'],'score_reveals':[{'offset':1.0,'player':'A','value':PAYOFFS['BR'][0]},{'offset':3.0,'player':'B','value':PAYOFFS['BR'][1]}],'note':'依次显出A五、B零；固定数对（5，0）。'},breaths=['小A得五分，'])
add('payoffs','bb_select','小A选蓝，小B也选蓝。',3.5,.6,cue={'action':'highlight_choices','matrix_cell':'BB','choices':{'A':'蓝','B':'蓝'},'note':'先选择，再结算。'},breaths=['小A选蓝，'])
add('payoffs','bb_score',CASE.score_text('BB'),2.5,1.0,cue={'action':'reveal_scores','matrix_cell':'BB','scores':PAYOFFS['BB'],'score_reveals':[{'offset':1.8,'player':'A','value':PAYOFFS['BB'][0]},{'offset':1.8,'player':'B','value':PAYOFFS['BB'][1]}],'note':'固定数对（1，1）；四格全部保留。'},breaths=['两个人，'])
add('payoffs','joint_choices','所以，收益取决于两个人的选择组合。',4.3,.9,cue={'action':'summarize_joint_choices','note':'完整矩阵静置，轻扫同一行的不同收益。'},breaths=['所以，'])
add('payoffs','beyond_money','收益不一定是钱，还可以表示节省的时间、声誉，或对结果的偏好。',revised_speech('收益不一定是钱，还可以表示节省的时间、声誉，或对结果的偏好。',6.0),1.0,['收益不一定是钱，','还可以表示节省的时间、声誉，或对结果的偏好。'],{'action':'broaden_payoff_meaning','note':'小图标配文字，避免把时间/声誉画成必定能直接相加的数。'},['不一定是钱，','节省的时间、声誉，'])
add('recap','intro','最后，记住这四问：',2.3,.7,cue={'action':'restore_four_questions'})
add('recap','first_pair','谁来决定？知道什么？',2.8,.8,cue={'action':'recap_first_pair','note':'参与者、信息两卡分别高亮。'},breaths=['谁来决定？'])
add('recap','second_pair','怎么选择？各得什么？',2.8,.8,cue={'action':'recap_second_pair','note':'策略、收益两卡分别高亮。'},breaths=['怎么选择？'])
add('recap','closing','先把博弈讲清楚，再分析大家会怎么选。',4.8,2.5,cue={'action':'closing_hold','note':'四问和完整原例稳定停留；最后两秒半不给新信息。'},breaths=['讲清楚，'])

t=0.0
for n,r in enumerate(rows,1):
    r['id']=f"s{n:02d}_{r.pop('key')}"
    r['start']=round(t,3)
    r['voiceover_end']=round(t+r['spoken_duration'],3)
    t=round(t+r['spoken_duration']+r['pause_after'],3)
    r['end']=t
    r['display_duration']=round(r['end']-r['start'],3)
    r['speech_plan_note']='估计口播窗，包含句内自然微停；不是实际录音的强制对齐结果。'
    r['text']='\n'.join(r['lines'])
sections=[]
names={'intro':'四个问题，看懂一场博弈','players':'参与者：谁在做决定','information':'信息：做决定时知道什么','strategy':'策略：能怎样选择','payoffs':'收益：不同选择，各得什么','recap':'四问复盘'}
for s in names:
    sr=[r for r in rows if r['section']==s]
    sections.append({'id':s,'title':names[s],'start':sr[0]['start'],'end':sr[-1]['end']})
data={
 'schema_version':'2.1','title':'四个问题，看懂一场博弈','language':'zh-CN','duration':t,'fps_reference':30,
 'timing_status':'manual_voiceover_reference_not_audio_aligned',
 'timing_notice':'本时间轴没有真人口播音频作为依据。发声时长、句内停顿与数值出现点均为人工参考；录制后应以实际呼吸和语义停顿重对齐，不能宣称已经按音频对齐。',
 'speech_guidance':{'tone':'清楚、平和，像面对一个第一次接触博弈论的人讲解。','names':'按当前参与者显示名读；中文姓名按中文发音，只有姓名中的拉丁字母读英语字母名称。不要省掉或替换人名。','numbers_and_symbols':'数值全部用中文数字口播；每格按参与者顺序读“姓名得几分”，不读括号、逗号或矩阵坐标；≠读不等于；行读 háng。','pace':'句内逗号轻停，问句和定义后留理解时间。允许局部伸缩，不要为踩时间码加速。','subtitle_policy':'整句或语义块完整出现；不逐字打字。字幕从start保留到end，包含尾部停顿，不提前收走。','pause_after_definition':'pause_after位于start/end显示窗的结尾：end = voiceover_end + pause_after。不是在end后再追加一次。'},
 'visual_contract':{'participants':CASE.players,'game_rounds':1,'matrix_orientation':f'{CASE.players[0]}为行，{CASE.players[1]}为列','matrix_score_order':CASE.players,'matrix_values':PAYOFFS,'matrix_reveal_order':['RR','RB','BR','BB'],'multi_round_is_comparison_only':True,'framework_note':'四问是入门整理，不是唯一公认分类。','information_note':'知道完整计分规则而看不到本轮行动，不能据此称为不完全信息。','persistent_visual_notes':['虚构教学案例','本片：一轮游戏'],'transitions':'转场优先落在pause_after内；字幕层保持清晰、稳定，不把转场时间从阅读窗硬扣除。'},
 'sections':sections,'segments':rows}
timeline_text=json.dumps(data,ensure_ascii=False,indent=2)+'\n'
def ts(s):
    ms=round(s*1000); h,ms=divmod(ms,3600000); m,ms=divmod(ms,60000); sec,ms=divmod(ms,1000)
    return f'{h:02d}:{m:02d}:{sec:02d},{ms:03d}'
srt='\n\n'.join(f"{i}\n{ts(r['start'])} --> {ts(r['end'])}\n{r['text']}" for i,r in enumerate(rows,1))+'\n'
def stamp(s):
    return f'{int(s)//60:02d}:{s%60:04.1f}'
head=f'''四个问题，看懂一场博弈｜V2 可录音稿

参考片长：{t:.1f}秒（{int(t)//60}分{t%60:.1f}秒）
重要：这是人工设计的口播参考，不是实际音频对齐。尚无真人音轨，也未合成声音。
请先按自己的自然速度完整试录。时间码用于找段，不是要求卡点；有实际口播后，再调整画面和字幕到录音。

读法与停顿
- 按当前参与者显示名读；中文姓名按中文发音，只有姓名中的拉丁字母读英语字母名称。
- 所有分数读中文数字，按参与者顺序读“姓名得几分”。不读括号、逗号或矩阵坐标。
- 收益矩阵的“行”读 háng。
- 逗号通常轻停，句号正常换气；问句、定义和每组得分之后稍留理解时间。
- 下列“停”是读完该段之后的参考停顿，已包含在段落时间内。可以随呼吸自然调整。
- 方括号内容不读。多轮只用于对照，随后明确回到一轮游戏。

'''
parts=[CASE.text(head)]
for s in sections:
    parts.append(f"\n【{s['title']}｜{stamp(s['start'])}–{stamp(s['end'])}】\n")
    for r in [x for x in rows if x['section']==s['id']]:
        parts.append(f"[{stamp(r['start'])}] {r['voiceover']}\n[停约{r['pause_after']:.1f}秒]\n")
parts.append('\n【自然连读版：仅正文】\n')
for s in sections:
    parts.append('\n'.join(r['voiceover'] for r in rows if r['section']==s['id'])+'\n')
voiceover_text='\n'.join(parts)
# Operational QA: CJK/letter/digit characters, punctuation excluded. Reference metrics, not speech standards.
def chars(s): return readable_count(s)
assert all(len(r['lines'])<=2 and max(map(chars,r['lines']))<=22 for r in rows)
assert all(r['end']>r['start'] and r['voiceover_end']<=r['end'] for r in rows)
assert all(abs(rows[i]['end']-rows[i+1]['start'])<.0001 for i in range(len(rows)-1))
assert all(''.join(r['lines'])==r['voiceover'] for r in rows)
for row in rows:
    cue=row['visual_cue']
    if 'matrix_cell' in cue:
        cell=cue['matrix_cell']
        assert cell in data['visual_contract']['matrix_values']
        if 'choices' in cue:
            assert cue['choices']=={'A':CASE.strategies[0 if cell[0]=='R' else 1],'B':CASE.strategies[0 if cell[1]=='R' else 1]}
        if 'scores' in cue:
            assert cue['scores']==data['visual_contract']['matrix_values'][cell]
        for reveal in cue.get('score_reveals',[]):
            assert reveal['player'] in ['A','B']
            assert 0<=reveal['offset']<=row['spoken_duration']
            assert reveal['value']==cue['scores'][0 if reveal['player']=='A' else 1]
reading=sorted([{'id':r['id'],'text':r['voiceover'],'count':chars(r['voiceover']),'display_seconds':r['display_duration'],'cps':round(chars(r['voiceover'])/r['display_duration'],3),'speech_estimate_cps':round(chars(r['voiceover'])/r['spoken_duration'],3)} for r in rows],key=lambda x:x['cps'],reverse=True)
metrics={'duration':t,'segment_count':len(rows),'spoken_characters':sum(chars(r['voiceover']) for r in rows),'planned_speech_duration':round(sum(r['spoken_duration'] for r in rows),3),'planned_tail_pause_duration':round(sum(r['pause_after'] for r in rows),3),'max_subtitle_cps':reading[0]['cps'],'max_subtitle_line_characters':max(chars(line) for r in rows for line in r['lines']),'max_subtitle_lines':max(len(r['lines']) for r in rows),'min_tail_pause':min(r['pause_after'] for r in rows),'max_tail_pause':max(r['pause_after'] for r in rows),'reading_rate_definition':'汉字、拉丁字母和数字计为一个可读字符；不计空格和标点；除以整块字幕显示时长。只用于版本自检，不是人的阅读速度标准。','densest_segments':reading[:5],'sections':sections,'checks':{'continuous_no_overlap':True,'subtitle_matches_voiceover':True,'two_lines_max':True,'line_22_readable_characters_max':True,'display_at_least_estimated_speech':True,'matrix_values_exact':True,'no_tts_or_actual_audio_alignment':True}}
write_products(OUT,{'timeline.json':timeline_text,'game_theory_v2_zh.srt':srt,
                    'voiceover_v2_zh.txt':voiceover_text,
                    'qa/metrics.json':json.dumps(metrics,ensure_ascii=False,indent=2)+'\n'})
print(json.dumps(metrics,ensure_ascii=False,indent=2))
