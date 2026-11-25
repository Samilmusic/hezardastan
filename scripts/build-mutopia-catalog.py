"""Builds the open Mutopia Project catalogue used by the public sheet finder.
Usage: python3 scripts/build-mutopia-catalog.py <MutopiaProject checkout>/ftp out.json
Source: https://github.com/MutopiaProject/MutopiaProject (headers of the LilyPond sources)."""
import os,re,json,collections,sys
ROOT=sys.argv[1]
field=re.compile(r'(mutopiatitle|mutopiacomposer|mutopiainstrument|mutopiaopus|title|composer|opus|arranger|style|license|copyright|footer|source)\s*=\s*(?:"((?:[^"\\]|\\.)*)"|\\markup\s*\{([^}]*)\})',re.S)
pieces={}
for dirpath,dirs,files in os.walk(ROOT):
    lyf=[f for f in files if f.endswith(('.ly','.ily'))]
    if not lyf: continue
    rel=os.path.relpath(dirpath,ROOT).split(os.sep)
    # piece dir = the dir whose child is "<name>-lys", or the dir containing files directly
    if rel[-1].endswith('-lys'): piece_rel=rel[:-1]
    else: piece_rel=rel
    key='/'.join(piece_rel)
    p=pieces.setdefault(key,{})
    for f in sorted(lyf,key=lambda f:(0 if f.startswith(piece_rel[-1]) else 1,f)):
        try: txt=open(os.path.join(dirpath,f),encoding='utf-8',errors='ignore').read(60000)
        except: continue
        for m in field.finditer(txt):
            k=m.group(1);v=(m.group(2) if m.group(2) is not None else m.group(3)) or ''
            v=re.sub(r'\s+',' ',v.replace('\\"','"')).strip()
            if v and k=='mutopiainstrument':
                p.setdefault('_inst',[])
                for x in re.split(r',',v):
                    x=x.strip()
                    if x and x not in p['_inst']: p['_inst'].append(x)
            if v and k not in p: p[k]=v
out=[];seen=set()
for key,p in pieces.items():
    foot=p.get('footer','');m=re.search(r'Mutopia-(\d{4})/\d\d/\d\d-(\d+)',foot)
    if not m: continue
    pid=int(m.group(2))
    if pid in seen: continue
    seen.add(pid)
    title=p.get('mutopiatitle') or p.get('title') or ''
    inst=', '.join(p.get('_inst',[]))
    lic=p.get('license') or p.get('copyright') or ''
    lic=lic if re.match(r'(Public Domain|Creative Commons)',lic) else ''
    if not title: continue
    out.append({'id':pid,'t':title,'c':p.get('composer') or p.get('mutopiacomposer',''),'cc':p.get('mutopiacomposer',''),'o':p.get('mutopiaopus') or p.get('opus',''),
                'i':inst,'a':p.get('arranger',''),'s':p.get('style',''),'l':lic[:80],'p':key})
out.sort(key=lambda r:r['id'])
print(len(out),'pieces');print(collections.Counter(len(r['i'])>0 for r in out))
insts=collections.Counter(x.strip() for r in out for x in re.split(r',| and |&|/',r['i']) if x.strip())
print(insts.most_common(40));print(collections.Counter(r['l'] for r in out).most_common(8))
json.dump(out,open(sys.argv[2],'w'),ensure_ascii=False,separators=(',',':'))
print(os.path.getsize(sys.argv[2])//1024,'KB')
print(out[0],out[500])
