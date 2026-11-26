# CareerConnect

CareerConnect is a job discovery website built with **HTML, CSS and vanilla JavaScript**. It pulls listings from two public job APIs, combines them into one list, and lets users search, filter, sort and save jobs before applying on the original listing.

## Project links

| Item | Link |
|---|---|
| Deployed website | https://www.kelvinzilla.tech/ |
| Load balancer (Lb01) | http://13.40.29.217 |
| Web01 | http://13.40.175.219 |
| Web02 | http://13.40.26.185 |
| Demo video (max 2 minutes) | `ADD YOUR YOUTUBE / VIMEO LINK HERE` |

## Credentials and API keys

**No API keys and no login are needed.** Both APIs are public and free to call from the browser, and the application has no user accounts. Nothing secret is stored in this repository.

## Features

- Job listings from **Arbeitnow** and **Remotive**, merged into one list.
- Search by job title, company, skill, description or location.
- Filter by location, employment type and remote status.
- Sort by newest, oldest or company name.
- "Remote" and "Saved" tabs.
- Job details dialog with a link to the original listing.
- Save and unsave jobs. Saved jobs are kept in the browser's local storage, even if a provider stops returning them.
- Error handling: if one provider is down, jobs from the other still show, with a notice. If both fail, a clear message and a "Try again" button appear.
- Browser-side caching for 30 minutes, to avoid repeated requests to the providers.
- "Show more jobs" button (20 at a time), so the page stays fast with hundreds of listings.
- Responsive layout for desktop and mobile, keyboard focus styles and reduced-motion support.

## Technology

- HTML5, CSS3, vanilla JavaScript (Fetch API, DOM, Local Storage, `<dialog>`)
- Arbeitnow Job Board API and Remotive Remote Jobs API
- Google Fonts: Bricolage Grotesque and Instrument Sans
- Nginx for static hosting and load balancing

## Project structure

```
careerconnect/
├── index.html    page structure
├── styles.css    all styling
├── app.js        fetching, filtering, rendering, caching, saved jobs
├── README.md
└── .gitignore
```

## Run locally

No build tools or package installation are required.

```bash
git clone ADD_YOUR_REPOSITORY_URL careerconnect
cd careerconnect
python3 -m http.server 8080
```

On Windows, use `python -m http.server 8080` if `python3` is not found. Then open http://localhost:8080.

An internet connection is needed because the listings come from the public APIs. Opening `index.html` directly also works, but a local server is more reliable.

## APIs used and credits

| API | Documentation |
|---|---|
| Arbeitnow Job Board API | https://www.arbeitnow.com/api |
| Remotive Remote Jobs API | https://remotive.com/remote-jobs/api |

Thank you to Arbeitnow and Remotive for providing free, public job data. CareerConnect is an independent educational project and is not affiliated with either provider. Job listings, descriptions and application links belong to their original sources, and every result shows its source and links to the original listing.

Remotive asks developers to limit request frequency and to credit and link to Remotive. CareerConnect caches successful results in the browser for 30 minutes to reduce requests. Browser caching is not a global rate limiter, so check the providers' current terms before any public production use.

Other credits: [Google Fonts](https://fonts.google.com) (Bricolage Grotesque and Instrument Sans, both under the SIL Open Font License).

## Security notes

- No API keys are used, so none can leak. If a key were ever needed, it would go in a server-side proxy and never in this repository (`.env` files are listed in `.gitignore`).
- All text from the APIs is escaped before it is placed in the page, and job descriptions are converted to plain text, which protects against cross-site scripting (XSS).
- External links open with `rel="noopener noreferrer"`.

## Deployment to Web01 and Web02

This is a static website, so no application server is needed. Deploy the same files to both web servers and serve them with Nginx.

Do the following on **each** web server (Ubuntu):

```bash
sudo apt update
sudo apt install -y nginx git
git clone ADD_YOUR_REPOSITORY_URL careerconnect
sudo mkdir -p /var/www/careerconnect
sudo cp -r careerconnect/* /var/www/careerconnect/
```

Create `/etc/nginx/sites-available/careerconnect` on **Web01**:

```nginx
server {
    listen 80;
    server_name _;
    root /var/www/careerconnect;
    index index.html;

    location = /server-info {
        default_type application/json;
        return 200 '{"server":"Web01","status":"ok"}';
    }

    location / {
        try_files $uri $uri/ =404;
    }
}
```

On **Web02**, use the same file but change the JSON value to `Web02`. The `/server-info` page lets us see which server answered a request.

Enable the site on each server and remove the default one:

```bash
sudo ln -s /etc/nginx/sites-available/careerconnect /etc/nginx/sites-enabled/careerconnect
sudo rm /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

Check each server directly before moving on:

```bash
curl http://13.40.175.219/server-info
curl http://13.40.26.185/server-info
```

| Server | Address |
|---|---|
| Web01 | http://13.40.175.219 |
| Web02 | http://13.40.26.185 |
| Lb01 | http://13.40.29.217 |

Make sure the firewall allows HTTP (port 80) from Lb01 to Web01 and Web02. Use private network addresses for backend traffic where they are available.

## Load balancer configuration (Lb01)

Install Nginx on Lb01, then create `/etc/nginx/sites-available/careerconnect` and replace the placeholders with the real addresses of Web01 and Web02:

```nginx
upstream careerconnect_servers {
    server 13.40.175.219:80;
    server 13.40.26.185:80;
}

server {
    listen 80;
    server_name _;

    location / {
        proxy_pass http://careerconnect_servers;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable it and reload:

```bash
sudo ln -s /etc/nginx/sites-available/careerconnect /etc/nginx/sites-enabled/careerconnect
sudo rm /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

The main site address, https://www.kelvinzilla.tech/, is served through Lb01.

Nginx uses round-robin distribution by default, so requests alternate between the two servers. Its failure handling is passive: if a server stops answering, Nginx stops sending it traffic for a while. This is not a full active health check.

## Testing the load balancer

1. Send repeated requests through Lb01:

   ```bash
   for i in $(seq 1 10); do
     curl -s http://13.40.29.217/server-info
     echo
   done
   ```

   The responses should show both `Web01` and `Web02`. Round-robin does not promise strict alternation in every sample.

2. Check that the website itself loads through the load balancer:

   ```bash
   curl -I http://13.40.29.217/
   ```

3. Test failover: stop Nginx on one web server (`sudo systemctl stop nginx`), confirm the site still loads through Lb01, then start it again (`sudo systemctl start nginx`).

**Test results:** `ADD A SHORT NOTE OR SCREENSHOT OF YOUR CURL OUTPUT HERE`

## Challenges and how I solved them

- **Different date formats.** Arbeitnow sends dates as Unix timestamps in seconds, while Remotive sends ISO date strings. Treating the Arbeitnow value as milliseconds made every job look like it was posted in 1970. I wrote one conversion function that handles both.
- **Different employment type names.** Remotive uses values like `full_time`, so the "Full-time" filter matched nothing. I normalise every type to a common form (`full-time`) for filtering and keep a readable version for display.
- **Browser storage limits.** Caching 300 jobs with full HTML descriptions exceeded the local storage limit, so caching silently failed. Descriptions are now converted to plain text and trimmed before they are cached.
- **Saved jobs disappearing.** Saving only job IDs meant a saved job vanished when an API stopped returning it. The app now stores the whole job object.
- **One provider failing.** Both requests run together with `Promise.allSettled`, so a failure in one source never blocks the other.
- **Large result lists.** Rendering several hundred listings at once was slow, so results are shown in pages of 20 with a "Show more jobs" button.
- **Nginx default site.** The default Nginx site can take over port 80, so it is removed on all three servers.

## Optional extras included

- Caching of API responses in the browser (30 minutes).
- Protection against XSS through escaping and plain-text descriptions.

## Possible future improvements

- A small server-side proxy for API caching shared by all users.
- User accounts so saved jobs follow people across devices.
- Docker packaging and a CI/CD pipeline.

## Demo video outline (2 minutes)

1. 0:00–0:20: introduce CareerConnect and its purpose.
2. 0:20–0:50: search for a job and apply filters.
3. 0:50–1:10: open a job, save it, and show the original listing.
4. 1:10–1:45: open `/server-info` through the load balancer several times to show Web01 and Web02.
5. 1:45–2:00: show the GitHub repository and the API credits.

## Disclaimer

CareerConnect is an educational project. Job data is provided by third parties and may be incomplete or out of date. Always confirm details on the original listing before applying.
