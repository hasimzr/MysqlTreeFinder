# 🌳 MySQL Tree Schema Finder

**MySQL Tree Schema Finder**, MySQL veritabanlarına bağlanmanızı, şema yapısını ağaç görünümünde keşfetmenizi, tablo ilişkilerini görsel olarak incelemenizi ve SQL sorguları çalıştırmanızı sağlayan modern, tarayıcı tabanlı bir veritabanı yönetim aracıdır.

---

## ✨ Özellikler

- 🔌 **Çoklu Bağlantı Yönetimi** — Birden fazla MySQL bağlantısını kaydedin, düzenleyin ve silin. Şifreler sunucu tarafında şifreli (`enc:v1:`) olarak saklanır.
- 🌲 **Şema Ağacı Görünümü** — Veritabanı → Tablo/View → Sütun hiyerarşisini ağaç yapısında keşfedebilirsiniz. PK/FK sütunları özel ikonlarla işaretlenir.
- 🔍 **Tablo Detayları** — Seçilen tablonun DDL (CREATE TABLE), sütun bilgileri, indeksler ve sayfalanmış örnek veri görüntüleme.
- 🔗 **İlişki Görünümü (RelationsView)** — Tablolar arası `FOREIGN KEY` ilişkilerini interaktif ağaç yapısında (üst/alt tablolar) gösterir.
- 👨‍👩‍👦 **Genealogy (Soy Ağacı) Görünümü** — Bir tablonun tüm ebeveyn ve çocuk ilişkilerini grafik şeklinde görselleştirir.
- 📝 **SQL Konsolu** — Söz dizimi renklendirme (syntax highlighting) ve akıllı otomatik tamamlama (autocomplete) desteğiyle SQL sorgularını çalıştırın.
- ✏️ **Hücre Düzenleyici (CellEditor)** — Tablo verilerini doğrudan arayüzden düzenleyin.
- 🗂️ **URL Hash Yönlendirme** — Tarayıcı geri/ileri tuşlarını destekler; bağlantı, şema ve tablo bilgisi URL hash'inde tutulur (derin link desteği).
- 🧪 **Demo Modu** — Gerçek bir MySQL sunucusuna ihtiyaç duymadan örnek e-ticaret veritabanı şemasını keşfedebilirsiniz.
- 🔐 **Şifre Güvenliği** — Şifreler `cryptoUtils.js` aracılığıyla şifrelenerek `connections.json` dosyasına yazılır. "Her bağlantıda sor" seçeneği de mevcuttur.

---

## 🛠️ Teknoloji Yığını

| Katman | Teknoloji |
|---|---|
| **Backend** | Node.js, Express.js |
| **Veritabanı** | MySQL (`mysql2` sürücüsü) |
| **Frontend** | Vanilla HTML, CSS, JavaScript (ES Modules) |
| **İkonlar** | Lucide Icons |
| **Ortam Değişkenleri** | dotenv |
| **CORS** | cors |

---

## 📁 Proje Yapısı

```
MysqlTreeSchemaFinder/
├── server.js              # Express API sunucusu (REST endpoint'leri)
├── db.js                  # MySQL bağlantı ve sorgu fonksiyonları
├── cryptoUtils.js         # Şifre şifreleme/çözme yardımcıları
├── connections.json       # Kayıtlı bağlantılar (otomatik oluşturulur)
├── package.json
└── public/
    ├── index.html         # Tek sayfa uygulama (SPA) giriş noktası
    ├── style.css          # Tüm uygulama stilleri
    └── js/
        ├── app.js         # Ana uygulama başlangıç noktası
        ├── router.js      # URL hash tabanlı yönlendirme
        ├── state.js       # Uygulama geneli durum (state) yönetimi
        ├── utils.js       # Yardımcı fonksiyonlar (tablo boyutlandırma vb.)
        ├── services/
        │   └── apiService.js        # Backend API çağrıları
        └── components/
            ├── WorkbenchHome.js     # Ana ekran / bağlantı listesi
            ├── ConnectionModal.js   # Bağlantı ekleme/düzenleme modalı
            ├── SchemaTree.js        # Sidebar şema ağacı
            ├── TableDetail.js       # Tablo detay paneli
            ├── RelationsView.js     # FK ilişki ağacı görünümü
            ├── GenealogyView.js     # Soy ağacı / grafik görünümü
            ├── SqlQueryConsole.js   # SQL sorgu konsolu
            ├── SqlAutocompleter.js  # SQL otomatik tamamlama motoru
            ├── SqlHighlighter.js    # SQL söz dizimi renklendirici
            └── CellEditor.js       # Satır içi hücre düzenleyici
```

---

## 🚀 Kurulum ve Çalıştırma

### Gereksinimler

- [Node.js](https://nodejs.org/) v18 veya üzeri
- Erişilebilir bir MySQL sunucusu (opsiyonel — Demo Modu kullanılabilir)

### Adımlar

```bash
# 1. Depoyu klonlayın
git clone https://github.com/kullanici-adi/MysqlTreeSchemaFinder.git
cd MysqlTreeSchemaFinder

# 2. Bağımlılıkları yükleyin
npm install

# 3. Uygulamayı başlatın
npm start
```

Sunucu başladıktan sonra tarayıcınızda şu adrese gidin:

```
http://localhost:3000
```

> Varsayılan port **3000**'dir. `PORT` ortam değişkeni ile değiştirilebilir.

### Ortam Değişkenleri (Opsiyonel)

Proje kökünde bir `.env` dosyası oluşturabilirsiniz:

```env
PORT=3000
```

---

## 🔌 API Endpoint'leri

| Yöntem | Endpoint | Açıklama |
|--------|----------|----------|
| `GET` | `/api/health` | Sunucu sağlık kontrolü |
| `GET` | `/api/connections` | Kayıtlı bağlantıları listele |
| `POST` | `/api/connections` | Yeni bağlantı ekle / güncelle |
| `DELETE` | `/api/connections/:id` | Bağlantı sil |
| `POST` | `/api/connect` | MySQL bağlantısını test et, veritabanı listesini döndür |
| `POST` | `/api/schema-tree` | Belirtilen şemanın tablo/view/sütun yapısını getir |
| `POST` | `/api/table-details` | Tablo DDL, indeks ve örnek veri |
| `POST` | `/api/table-relations` | Tablonun FK ilişkilerini getir |
| `POST` | `/api/table-data` | Sayfalanmış tablo verisi |
| `POST` | `/api/execute-query` | Serbest SQL sorgusu çalıştır |

---

## 🧪 Demo Modu

Herhangi bir MySQL kurulumu olmadan uygulamayı denemek için **Demo Modu (E-Ticaret Veritabanı)** bağlantısını kullanabilirsiniz. Bu mod şu örnek şemaları içerir:

- `ecommerce_prod` — Ürün, sipariş, müşteri tabloları
- `university_portal` — Öğrenci, ders, akademisyen tabloları
- `hr_analytics` — Çalışan, departman, maaş tabloları

---

## 🔐 Güvenlik Notları

- Şifreler `connections.json` dosyasına düz metin olarak **yazılmaz**; `cryptoUtils.js` tarafından şifrelenir.
- **"Şifreyi Her Bağlantıda Sor"** seçeneği etkinleştirildiğinde şifre hiçbir şekilde diskte saklanmaz.
- Bu araç yerel geliştirme ortamları için tasarlanmıştır. Üretim ortamında kullanılacaksa ek güvenlik önlemleri alınmalıdır (auth, HTTPS vb.).

---

## 📄 Lisans

Bu proje [MIT Lisansı](LICENSE) altında dağıtılmaktadır.
