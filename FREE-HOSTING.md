# Vibrix — Ücretsiz Yayında Tutma Rehberi

## Şu an ne oluyor?

Render'ın ücretsiz planında **disk yok**. Bu şu demek:

- Her `git push` (yeni deploy) → veritabanı **sıfırlanır**
- 15 dakika trafik almazsa servis uyur → uyanırken de sıfırlanabilir
- Yüklediğin şarkılar, hesaplar, skorlar **kaybolur**

Ama **kodun kendisi** kalıcı: `git push` yaptığında site güncellenir, bu bedava.

## Çözüm: kendin yedekle, kendin geri yükle

Projede iki betik var:

```bash
node scripts/backup-export.cjs yedek.json   # tüm veriyi JSON'a yazar
node scripts/backup-import.cjs yedek.json   # geri yükler
```

### Günlük rutin (deploy öncesi)

1. **Yedeği al** — Render Shell'den veya sitenin olduğu makineden:
   ```bash
   node scripts/backup-export.cjs
   ```
   Çıkan `vibrix-backup-YYYY-MM-DD.json` dosyasını **bilgisayarına indir**.
   (Render Shell'de dosyayı indirmek zor olabilir; bunun yerine `cat` ile
   içeriği kopyalayıp kendi bilgisayarında dosyaya kaydedebilirsin.)

2. **Kod güncellemesi yap** — `git push`. Site sıfırlanır.

3. **Yedeği geri yükle** — Render Shell'den:
   ```bash
   node scripts/backup-import.cjs yedek.json
   ```

> **Önemli:** Yedek JSON'da şarkıların **verisi** var ama ses dosyaları yok.
> Ses dosyaları `public/uploads/` altında ve deploy'da silinir.
> Şarkıları yeniden yüklemek gerekir. Bu yüzden:

### En pratik yol (önerdiğim)

**Kod güncellemesini ayda bir yap**, şarkı eklemeyi sık yap.
Kod değişmediği sürece site sıfırlanmaz. Sadece şu durumlarda deploy gerekir:

- Yeni bir özellik/hata düzeltmesi istediğinde
- Ben sana kod değişikliği gönderdiğimde

Şarkı eklemek **deploy gerektirmez** — Chart Editor'den yükle, anında yayında.

## Alternatif: siteyi kilitle

Site herkese açık olduğu için yabancı biri grafik yükleyip diskini doldurabilir
(ücretsiz planın sınırı var). Korumak için Render → Environment:

| Key | Value |
|---|---|
| `SITE_USER` | `bfali` (kendin seç) |
| `SITE_PASS` | güçlü bir şifre |

Bu ikisi girilince site tarayıcıdan **kullanıcı adı + şifre** ister. `/api/health`
muaf kalır (Render'ın sağlık kontrolü için). Silmek istersen iki değişkeni
Environment'tan kaldır, site yine herkese açık olur.

## Özet

| İş | Deploy gerekir mi? | Veri kaybı? |
|---|---|---|
| Şarkı eklemek | ❌ Hayır | ❌ Yok |
| Skor oynamak | ❌ Hayır | ❌ Yok |
| Kod güncellemesi | ✅ Evet | ⚠️ Var (yedek al) |
| Render uykudan uyanma | — | ⚠️ Olabilir |

**Kural: kod değişikliğinden önce yedek al.**
