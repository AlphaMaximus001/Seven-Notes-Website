"""Download a Shopify store's public product feed.
Usage: python3 scripts/images/pull_catalog.py www.bajaao.com .cache/cat/www.bajaao.com.json"""
import urllib.request, json, time, sys, os
d=sys.argv[1]; out=sys.argv[2]; allp=[]
for page in range(1,200):
    url=f'https://{d}/products.json?limit=250&page={page}'
    for t in range(3):
        try:
            r=urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0'}),timeout=60); data=json.load(r); break
        except Exception as e:
            print('err',page,e,flush=True); time.sleep(5); data=None
    if not data or not data.get('products'): break
    for p in data['products']:
        allp.append({'title':p['title'],'handle':p['handle'],'vendor':p.get('vendor'),'type':p.get('product_type'),'tags':p.get('tags'),
          'images':[i['src'] for i in p.get('images',[])][:6],'body':(p.get('body_html') or '')[:3000],
          'variants':[{'title':v.get('title'),'sku':v.get('sku'),'price':v.get('price')} for v in p.get('variants',[])][:20]})
    print(d,page,len(allp),flush=True); time.sleep(0.7)
json.dump(allp,open(out,'w'))
