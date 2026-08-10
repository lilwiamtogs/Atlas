# Atlas Vision API

This Cloudflare Worker is Atlas's optional AI fallback for schedule screenshots. It uses the Workers AI binding and does not require an OpenAI, Anthropic, or Google API key.

## Commands

```powershell
npm.cmd install
npx.cmd wrangler login
npm.cmd run deploy
```

After deployment, open the returned `workers.dev` URL. A healthy deployment returns:

```json
{"ok":true,"service":"Atlas Vision API"}
```

The frontend integration should call `POST /scan` with a PNG, JPEG, or WebP data URL in the `image` field. Keep the free Workers plan unless you intentionally want paid overage.
