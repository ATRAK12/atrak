const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { URL } = require("url");

const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "ChangeMe123!";
const PUBLIC_DIR = path.join(__dirname, "public");
const DATA_DIR = path.join(__dirname, "data");
const DB = path.join(DATA_DIR, "store.json");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DB)) {
  fs.writeFileSync(DB, JSON.stringify({
    settings: {
      siteNameFa: "A.T.R.A.K",
      siteNameEn: "Atrak",
      descriptionFa: "فروشگاه تخصصی پوشاک تاکتیکال",
      descriptionEn: "Atrak tactical apparel store",
      domain: "https://example.com"
    },
    products: [
      {id:1, nameFa:"کاپشن تاکتیکال ضدآب", nameEn:"Waterproof Tactical Jacket", price:3450000, category:"لباس تاکتیکال", emoji:"🧥", stock:10, active:true},
      {id:2, nameFa:"بوت تاکتیکال کوهنوردی", nameEn:"Tactical Hiking Boots", price:3280000, category:"کفش و بوت", emoji:"🥾", stock:8, active:true},
      {id:3, nameFa:"کوله پشتی تاکتیکال", nameEn:"Tactical Backpack", price:2980000, category:"کوله و کیف", emoji:"🎒", stock:15, active:true},
      {id:4, nameFa:"پیراهن تاکتیکال کامبت", nameEn:"Tactical Combat Shirt", price:2280000, category:"لباس تاکتیکال", emoji:"👕", stock:12, active:true}
    ],
    orders: []
  }, null, 2));
}
function readDB(){ return JSON.parse(fs.readFileSync(DB,"utf8")); }
function writeDB(x){ fs.writeFileSync(DB, JSON.stringify(x,null,2)); }

const sessions = new Set();
function cookie(req,name){
  const c = (req.headers.cookie||"").split(";").map(x=>x.trim()).find(x=>x.startsWith(name+"="));
  return c ? decodeURIComponent(c.split("=")[1]) : "";
}
function isAdmin(req){ return sessions.has(cookie(req,"atrak_session")); }
function json(res,status,obj){
  const body=JSON.stringify(obj);
  res.writeHead(status,{"Content-Type":"application/json; charset=utf-8","Content-Length":Buffer.byteLength(body)});
  res.end(body);
}
function body(req){
  return new Promise((resolve,reject)=>{
    let d=""; req.on("data",c=>d+=c); req.on("end",()=>{try{resolve(d?JSON.parse(d):{})}catch(e){reject(e)}}); req.on("error",reject);
  });
}
function sendFile(res,file,type){
  fs.readFile(file,(err,data)=>{
    if(err){res.writeHead(404);return res.end("Not found")}
    res.writeHead(200,{"Content-Type":type});res.end(data);
  });
}

const MIME={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8",".png":"image/png",".jpg":"image/jpeg",".svg":"image/svg+xml",".json":"application/json"};
const server=http.createServer(async(req,res)=>{
  const u=new URL(req.url,`http://${req.headers.host}`);
  try{
    if(u.pathname==="/api/settings" && req.method==="GET") return json(res,200,readDB().settings);
    if(u.pathname==="/api/products" && req.method==="GET") return json(res,200,readDB().products.filter(p=>p.active));
    if(u.pathname==="/api/search" && req.method==="GET"){
      const q=(u.searchParams.get("q")||"").toLowerCase();
      const db=readDB();
      return json(res,200,db.products.filter(p=>p.active && ((p.nameFa+" "+p.nameEn+" "+p.category).toLowerCase().includes(q))));
    }
    if(u.pathname==="/api/order" && req.method==="POST"){
      const x=await body(req), db=readDB();
      if(!x.customer || !x.items || !x.items.length) return json(res,400,{error:"اطلاعات سفارش ناقص است"});
      const order={id:Date.now(),createdAt:new Date().toISOString(),status:"جدید",customer:x.customer,items:x.items,total:x.total||0};
      db.orders.push(order); writeDB(db);
      return json(res,201,{ok:true,orderId:order.id});
    }
    if(u.pathname==="/api/login" && req.method==="POST"){
      const x=await body(req);
      if(x.password!==ADMIN_PASSWORD) return json(res,401,{error:"رمز عبور نادرست است"});
      const token=crypto.randomBytes(24).toString("hex"); sessions.add(token);
      res.writeHead(200,{"Content-Type":"application/json","Set-Cookie":`atrak_session=${token}; HttpOnly; SameSite=Lax; Path=/`});
      return res.end(JSON.stringify({ok:true}));
    }
    if(u.pathname==="/api/logout" && req.method==="POST"){
      sessions.delete(cookie(req,"atrak_session"));
      res.writeHead(200,{"Set-Cookie":"atrak_session=; Max-Age=0; Path=/","Content-Type":"application/json"});return res.end("{}");
    }
    if(u.pathname.startsWith("/api/admin/")){
      if(!isAdmin(req)) return json(res,401,{error:"ورود مدیر لازم است"});
      const db=readDB();
      if(u.pathname==="/api/admin/products" && req.method==="GET") return json(res,200,db.products);
      if(u.pathname==="/api/admin/orders" && req.method==="GET") return json(res,200,db.orders);
      if(u.pathname==="/api/admin/products" && req.method==="POST"){
        const x=await body(req); x.id=Date.now(); x.active=x.active!==false; db.products.push(x); writeDB(db); return json(res,201,x);
      }
      const pm=u.pathname.match(/^\/api\/admin\/products\/(\d+)$/);
      if(pm && req.method==="PUT"){
        const x=await body(req), i=db.products.findIndex(p=>p.id==pm[1]);
        if(i<0) return json(res,404,{error:"محصول پیدا نشد"});
        db.products[i]={...db.products[i],...x,id:db.products[i].id}; writeDB(db); return json(res,200,db.products[i]);
      }
      if(pm && req.method==="DELETE"){
        db.products=db.products.filter(p=>p.id!=pm[1]); writeDB(db); return json(res,200,{ok:true});
      }
      const om=u.pathname.match(/^\/api\/admin\/orders\/(\d+)$/);
      if(om && req.method==="PUT"){
        const x=await body(req), o=db.orders.find(p=>p.id==om[1]);
        if(!o) return json(res,404,{error:"سفارش پیدا نشد"});
        o.status=x.status||o.status; writeDB(db); return json(res,200,o);
      }
      if(u.pathname==="/api/admin/settings" && req.method==="PUT"){
        const x=await body(req); db.settings={...db.settings,...x}; writeDB(db); return json(res,200,db.settings);
      }
    }

    if(u.pathname==="/robots.txt"){
      const db=readDB(); res.writeHead(200,{"Content-Type":"text/plain; charset=utf-8"});
      return res.end(`User-agent: *\nAllow: /\nSitemap: ${db.settings.domain.replace(/\/$/,"")}/sitemap.xml\n`);
    }
    if(u.pathname==="/sitemap.xml"){
      const db=readDB(), base=db.settings.domain.replace(/\/$/,"");
      const xml=`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${base}/</loc></url><url><loc>${base}/?lang=en</loc></url></urlset>`;
      res.writeHead(200,{"Content-Type":"application/xml; charset=utf-8"});return res.end(xml);
    }

    let file=u.pathname==="/" ? path.join(PUBLIC_DIR,"index.html") : path.join(PUBLIC_DIR,u.pathname);
    if(!file.startsWith(PUBLIC_DIR)) return res.writeHead(403),res.end("Forbidden");
    return sendFile(res,file,MIME[path.extname(file)]||"application/octet-stream");
  }catch(e){console.error(e);json(res,500,{error:"خطای سرور"})}
});
server.listen(PORT, "0.0.0.0", ()=>console.log(`Atrak running on port ${PORT}`));
