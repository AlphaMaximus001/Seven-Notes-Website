"""Search the downloaded catalogues: echo "kadence+nk51" | python3 scripts/images/query.py"""
import json,glob,os,re,sys,pickle
S=os.environ.get('SN_CACHE', '.cache')  # holds cat/*.json from pull_catalog.py
pk=S+'/cat.pkl'
if os.path.exists(pk): cat=pickle.load(open(pk,'rb'))
else:
    cat=[]
    for f in glob.glob(S+'/cat/*.json'):
        src=os.path.basename(f).replace('.json','')
        for p in json.load(open(f)):
            if not p['images']: continue
            blob=' '.join([p['title'],p['handle'],' '.join((v.get('sku') or '')+' '+(v.get('title') or '') for v in p['variants']),' '.join(i.rsplit('/',1)[1] for i in p['images'])])
            cat.append({'src':src,'title':p['title'],'c':re.sub(r'[^a-z0-9]','',blob.lower()),'images':p['images'],'handle':p['handle'],'body':p['body'][:1500],'type':p.get('type')})
    pickle.dump(cat,open(pk,'wb'))
def find(terms, n=5):
    ts=[re.sub(r'[^a-z0-9]','',t.lower()) for t in terms]
    r=[p for p in cat if all(t in p['c'] for t in ts)]
    r.sort(key=lambda p:len(p['title']))
    return r[:n]
if __name__=='__main__':
    for line in sys.stdin:
        line=line.strip()
        if not line: continue
        res=find(line.split('+'))
        print('##',line,'->',len(res)); 
        for p in res: print('   ',p['src'][:7],'|',p['title'][:90])
