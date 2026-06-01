# Self-Ordering Menu System Deployment

This folder is ready to deploy as a small Node.js web app.

## What Changes Online

When hosted publicly, customers do not need restaurant Wi-Fi. Each QR code uses the public website URL automatically:

```text
https://your-public-domain.com/self-ordering-system.html?table=1
https://your-public-domain.com/self-ordering-system.html?table=2
...
https://your-public-domain.com/self-ordering-system.html?table=21
```

## Recommended First Hosting: Render

1. Create a GitHub repository and upload these files.
2. Create a new Render Web Service from the repository.
3. Use these settings:
   - Runtime: Node
   - Build command: leave blank
   - Start command: `npm start`
   - Health check path: `/api/health`
4. Add a persistent disk:
   - Mount path: `/var/data`
   - Environment variable: `DATA_DIR=/var/data`
5. Deploy.
6. Open the public Render URL.
7. Go to Admin and print/save the 21 table QR codes.

## Important Production Notes

- The current system stores orders in `orders-data.json`.
- For heavier use, upgrade the backend to PostgreSQL or Supabase.
- Add staff/admin password protection before real public launch.
- Use a custom domain such as `order.yourrestaurant.com`.
- Keep the kitchen screen open on the public URL and select Kitchen.

## Local Testing

```bash
npm start
```

Then open:

```text
http://localhost:8080/self-ordering-system.html?table=1
```
