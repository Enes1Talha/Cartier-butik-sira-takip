# Butik Sira Takip

Butikte/magazada bekleyen musteri sirasini canli takip eden, sadece
yetkili kisilerin girebildigi bir uygulama. Google ile giris yapilir;
sadece izin verilen e-posta adresleri listeyi gorebilir ve duzenleyebilir.

## Ozellikler

- Satis ve CS icin ayri bekleme kuyruklari
- Kisi sayisi, bekleme suresi, danismana devir, "ayrildi" takibi
- Vardiya notu (ekip ici ortak not)
- Gunluk ozet ve panoya kopyalama
- Google ile giris + e-posta allowlist (sadece belirlenen yoneticiler)
- Firestore ile gercek zamanli senkronizasyon (herkes ayni listeyi ayni anda gorur)

## Kurulum

### 1. Firebase projesi olustur

1. https://console.firebase.google.com adresine git, "Add project" ile yeni proje olustur.
2. Sol menuden **Build > Authentication** a gir, "Get started" a bas, **Sign-in method**
   sekmesinden **Google** saglayicisini ac.
3. Sol menuden **Build > Firestore Database** a gir, "Create database" ile
   Firestore'u olustur (production mode secebilirsin, kurallari asagida ayri ekleyecegiz).
4. **Project settings > General** sekmesine gir, en altta "Your apps" bolumunde
   **Web (</>)** simgesine tikla, bir web app kaydet. Karsina cikan
   `firebaseConfig` degerlerini not al.

### 2. Ortam degiskenlerini ayarla

```bash
cp .env.example .env
```

`.env` dosyasini ac, Firebase Console'dan aldigin degerleri ilgili
satirlara yapistir (`VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, vb).

### 3. Yetkili kisileri tanimla

Iki dosyayi da guncellemen gerekiyor (biri arayuz icin, biri gercek guvenlik icin):

**`src/allowedUsers.js`** — arayuzde kim girebilir gosterimi icin:
```js
export const ALLOWED_EMAILS = [
  "senin-google-mailin@gmail.com",
  "yonetici1@ornek.com",
];
```

**`firestore.rules`** — asil erisim kontrolu, sunucu tarafinda calisir:
```
function isAllowed() {
  return request.auth != null && request.auth.token.email in [
    "senin-google-mailin@gmail.com",
    "yonetici1@ornek.com"
  ];
}
```

Bu iki listeyi birbiriyle ayni tut. `allowedUsers.js` sadece arayuzde
"erisimin yok" ekranini gostermek icin; gercek guvenlik `firestore.rules`
dosyasinda. Biri olmadan digeri tek basina yeterli degil.

### 4. Firestore kurallarini yayinla

Firebase CLI kurulu degilse:
```bash
npm install -g firebase-tools
firebase login
```

Proje klasorunde:
```bash
firebase init firestore   # var olan projeyi sec, firestore.rules dosyasini kullan
firebase deploy --only firestore:rules
```

### 5. Yerelde calistir

```bash
npm install
npm run dev
```

Tarayicida acilan adrese git, Google ile giris yap. Eger e-postan
allowlist'te yoksa "Erisim yok" ekranini gorursun — bu normal, listeye
eklenince calisir.

### 6. Yayina al (herkesin kullanabilecegi gercek bir adres)

En kolay yol Firebase Hosting:
```bash
npm run build
firebase init hosting     # public directory: dist, single-page app: yes
firebase deploy --only hosting
```

Bu sana `https://<proje-adi>.web.app` seklinde gercek bir adres verir —
Emar AVM'deki magazada tablet/telefon tarayicisindan bu adrese girip
kullanabilirsiniz.

Alternatif olarak Vercel de kullanilabilir (`vercel` CLI ile, ortam
degiskenlerini Vercel proje ayarlarina ekleyerek).

### 7. GitHub'a ekle

```bash
git init
git add .
git commit -m "Butik sira takip - ilk surum"
git remote add origin <senin-repo-linkin>
git push -u origin main
```

`.env` dosyasi `.gitignore` icinde oldugu icin Firebase anahtarlarin
GitHub'a gitmez — bu normal ve dogru davranis. README'deki kurulum
adimlari sayesinde baskasi da projeyi klonlayip kendi Firebase projesiyle
calistirabilir; bu da portfolyo acisindan iyi bir izlenim birakir.

## Teknik notlar

- **Frontend**: React + Vite
- **Kimlik dogrulama**: Firebase Authentication (Google Sign-In)
- **Veritabani**: Firestore, gercek zamanli senkronizasyon icin `onSnapshot`
- **Erisim kontrolu iki katmanli**:
  - `src/AuthGate.jsx` — arayuzde "erisimin yok" ekranini gosterir (UX icin)
  - `firestore.rules` — asil guvenlik, sunucu tarafinda zorunlu kilinir
    (birisi tarayici konsolundan `allowedUsers.js` listesini degistirse
    bile Firestore kurallarini asamaz)
