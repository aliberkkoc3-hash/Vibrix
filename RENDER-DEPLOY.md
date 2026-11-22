# Vibrix'i Render'a Taşıma (adım adım)

## 0. Bilmen gereken iki şey

1. **Render'ın ücretsiz planı 15 dakika trafik almazsa uyur.** İlk ziyarette ~30 saniye
   açılma sürer. Uyanık kalsın istiyorsan Starter plana (aylık ücretli) geçmen gerekir.
2. **Disk ücretli plana bağlı.** Ücretsiz planda dosya sistemi geçicidir: sunucu her
   yeniden başladığında **yüklediğin ses dosyaları ve veritabanı silinir.**
   Kalıcı olması için `render.yaml` içindeki `disk:` bloğu zaten hazır — Starter plana
   geçtiğinde otomatik devreye girer.

## 1. Git deposu oluştur (bir kez)

Proje klasöründe terminal aç:

```bash
git init
git add .
git commit -m "Vibrix"
```

GitHub'da boş bir depo aç (ör. `vibrix`), sonra:

```bash
git remote add origin https://github.com/KULLANICI_ADIN/vibrix.git
git branch -M main
git push -u origin main
```

> `.gitignore` hazır: `node_modules`, `data/*.db` ve `data/screenshots` depoya girmez.

## 2. Render'da servis aç

1. https://dashboard.render.com → **New +** → **Web Service**
2. **Connect a repository** → GitHub'ı bağla → `vibrix` deposunu seç
3. Ayarları şöyle doldur:

| Alan | Değer |
|---|---|
| Name | `vibrix` |
| Region | Frankfurt (Türkiye'ye en yakın) |
| Branch | `main` |
| Runtime | **Node** |
| Build Command | `npm ci --omit=dev` |
| Start Command | `node server/index.js` |
| Health Check Path | `/api/health` |
| Instance Type | Free (başlangıç için) |

4. **Environment** sekmesi → şu değişkenleri ekle:

| Key | Value |
|---|---|
| `NODE_VERSION` | `22.11.0` |
| `HOST` | `0.0.0.0` |
| `VIBRIX_DB` | `/var/data/vibrix.db` (disk varsa) |

> **`HOST=0.0.0.0` şart.** Kod varsayılan olarak `127.0.0.1` dinliyor; Render dışarıdan
> erişemez ve servis "unhealthy" görünür.

5. **Create Web Service** → ilk build ~3-5 dakika sürer.

## 3. İlk açılış

- Adresin: `https://vibrix-xxxx.onrender.com`
- Veritabanı boş açılır. Admin hesabını siteden **Kayıt Ol** ile açarsın.
- Örnek grafikleri yüklemek istersen Render **Shell** sekmesinden:

```bash
node server/seed.js
```

## 4. Sonraki güncellemeler

```bash
git add .
git commit -m "değişiklik"
git push
```

Render `main` dalına gelen her push'ta kendiliğinden yeniden deploy eder.

## 5. Kalıcı disk (ücretli plan)

Starter plana geçtikten sonra **Settings → Disks → Add Disk**:

| Alan | Değer |
|---|---|
| Name | `vibrix-data` |
| Mount Path | `/var/data` |
| Size | 1 GB |

Sonra `VIBRIX_DB=/var/data/vibrix.db` değişkenini ekle (zaten `render.yaml` içinde var).
Yüklenen ses dosyaları `public/uploads` altında kalır — bunlar diskte değil, kod
klasöründe. Kalıcı olmalarını istiyorsan bir sonraki adım onları da `/var/data`'ya taşımak.

## 6. Sık karşılaşılan hatalar

| Belirti | Sebep / Çözüm |
|---|---|
| `Cannot open database because the directory does not exist` | `VIBRIX_DB=/var/data/vibrix.db` yazılmış ama disk eklenmemiş. Kod artık klasörü kendisi oluşturuyor; yine de kalıcılık için disk gerekir. Disksiz kullanacaksan `VIBRIX_DB` değişkenini **tamamen sil**. |
| Deploy "unhealthy" | `HOST=0.0.0.0` eklenmemiş |
| Build'de `better-sqlite3` hatası | `NODE_VERSION=22.11.0` ekle (Render'ın varsayılanı çok yeni olabilir) |
| 502 / uygulama açılmıyor | Logs sekmesinde `Vibrix çalışıyor` satırını ara |
| Kayıtlar her deploy'da siliniyor | Disk yok — Starter plan + disk gerekir |
| İlk açılış 30 sn | Ücretsiz plan uykuda, normal |

## 7. Kontrol listesi

- [ ] `git push` yapıldı, Render deposunu görüyor
- [ ] `HOST=0.0.0.0` eklendi
- [ ] `NODE_VERSION=22.11.0` eklendi
- [ ] `/api/health` → `{"ok":true}` dönüyor
- [ ] Kayıt olup giriş yapıldı
- [ ] Bir grafik oynanıp skor kaydedildi
