"""Resolve each SKU to a verified catalogue photo (scripts/image_hints.py) and save WebP files.
Usage: python3 scripts/images/fetch_images.py scripts/products.raw.json scripts/images.json"""
import json, re, sys, os, io, urllib.request, concurrent.futures as cf
HERE=os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.path.dirname(HERE)); sys.path.insert(0, HERE)
from image_hints import HINTS
from query import cat
from PIL import Image
REPO=os.path.dirname(os.path.dirname(HERE)); OUT=REPO+'/assets/img/products'; os.makedirs(OUT,exist_ok=True)
raw=json.load(open(sys.argv[1])); prods=raw['products']
COL={'Black':['black','blk','bk'],'Natural':['natural','nat','na'],'Sunburst':['sunburst','sb','sun'],'Brown':['brown','brn'],'Blue':['blue','blu','bl'],'Red':['red','rd'],'Pink':['pink','pk'],'White':['white','wh'],'Mahogany':['mahogany','mah']}
def pick(x):
    for pat,terms in HINTS:
        if re.search(pat,x['name'],re.I):
            if not terms: return None,pat
            ts=[re.sub(r'[^a-z0-9]','',t.lower()) for t in terms]
            r=[p for p in cat if all(t in p['c'] for t in ts)]
            if not r: return None,pat
            def key(p):
                t=p['title'].lower(); s=0
                if 'open box' in t or 'b stock' in t: s+=50
                if x.get('colour') and any(re.search(r'\b'+c+r'\b',t) for c in COL.get(x['colour'],[x['colour'].lower()])): s-=20
                return (s,len(t))
            r.sort(key=key); return r[0],pat
    return None,None
def dl(url, dest):
    if url.startswith('//'): url='https:'+url
    req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0'})
    data=urllib.request.urlopen(req,timeout=40).read()
    im=Image.open(io.BytesIO(data))
    if im.mode in ('RGBA','LA','P'):
        im=im.convert('RGBA'); bg=Image.new('RGB',im.size,(255,255,255)); bg.paste(im,mask=im.split()[-1]); im=bg
    else: im=im.convert('RGB')
    if min(im.size)<300: raise ValueError('too small %s'%(im.size,))
    im.thumbnail((1000,1000),Image.LANCZOS)
    im.save(dest,'WEBP',quality=80,method=6)
    return im.size
result={}
def work(x):
    p,pat=pick(x)
    if not p: return x['id'],{'matched':False,'hint':pat}
    files=[]
    for i,u in enumerate(p['images'][:3]):
        f=f"{x['id']}-{i+1}.webp"; dest=OUT+'/'+f
        try:
            if not os.path.exists(dest): dl(u,dest)
            files.append('assets/img/products/'+f)
        except Exception as e: print('ERR',x['id'],u[:80],e,file=sys.stderr)
    return x['id'],{'matched':bool(files),'source':p['src'],'sourceTitle':p['title'],'images':files,'type':p.get('type')}
with cf.ThreadPoolExecutor(8) as ex:
    for k,v in ex.map(work,prods): result[k]=v
json.dump(result,open(sys.argv[2],'w'),indent=1)
m=sum(1 for v in result.values() if v['matched']); print('with photos:',m,'/',len(prods))
