# Vercel backend for Smart Farm

This replaces the Firebase Function and does not need Firebase Blaze. Deploy this folder as a separate Vercel project, while GitHub Pages continues to serve `index.html`.

## 1. Create the Vercel project

1. Push the `vercel-backend` folder to the same GitHub repository as your website.
2. In Vercel, select **New Project**, import that GitHub repository, and set **Root Directory** to `vercel-backend`.
3. Deploy once. Vercel will install the packages in `package.json` and publish the route `/api/satellite-surface`.

## 2. Add environment variables in Vercel

In Vercel Project Settings → Environment Variables, add these for Production and Preview. Never commit any JSON key.

| Name | Value |
| --- | --- |
| `EARTH_ENGINE_PROJECT` | `ai-smart-farm-2c987` |
| `EARTH_ENGINE_SERVICE_ACCOUNT` | The entire **new** Earth Engine service-account JSON |
| `FIREBASE_ADMIN_SERVICE_ACCOUNT` | A separate Firebase Admin service-account JSON from the same Firebase project |
| `ALLOWED_ORIGIN` | Your exact GitHub Pages origin, for example `https://your-name.github.io` |

The Earth Engine service account must be registered for Earth Engine and granted its required Earth Engine roles. The Firebase Admin account must be from `ai-smart-farm-2c987`; this verifies the signed-in user's Firebase token before spending Earth Engine compute.

## 3. Connect the web page

After Vercel prints your production domain, edit this line in `index.html`:

```js
const satelliteSurfaceConfig={
  endpoint:'https://YOUR-VERCEL-PROJECT.vercel.app/api/satellite-surface',
  defaultSource:'Sentinel-2 / Landsat'
};
```

Push `index.html` to GitHub Pages. Sign in to the farm page, pin a plot, and the dashboard will call the Vercel function with the Firebase ID token.

## Security and limits

- The function only accepts the exact `ALLOWED_ORIGIN` and a verified Firebase user token.
- Do not expose either service-account JSON in GitHub, the webpage, chat, or screenshots.
- Vercel Hobby is for personal, non-commercial use. For business use, use a suitable paid plan and the appropriate Earth Engine commercial arrangement.
- `soilMoisture` remains `null`: Sentinel-2 and Landsat do not directly measure root-zone soil moisture.
