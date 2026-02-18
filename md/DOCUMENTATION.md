# API Routes for cubingtools.de Backend

This module defines the API routes for the `cubingtools.de` backend.  
It includes endpoints for fetching **WCA data**, **tool metadata**, and **server status**.

## Dependencies

- `express`: Web framework for Node.js  
- `axios`: Promise-based HTTP client for the browser and Node.js  
- `path`: Utilities for working with file and directory paths  
- `fs`: File system module for interacting with the file system  
- `dotenv`: Loads environment variables from a `.env` file into `process.env`

---

## API Endpoints

### WCA API

#### `GET /api/wca/:wcaId/:event`

Fetches WCA competitor data for a specific event.

- **URL Parameters**:
  - `wcaId`: WCA ID of the competitor (e.g., `2023ABCD01`)
  - `event`: Event ID (e.g., `333`) or `name` for competitor name
- **Query Parameters**:
  - `num`: Number of solves to return (default: 12)
  - `getsolves`: If `true`, returns all solves
  - `getaverages`: If `true`, returns all competition averages
- **Response**: JSON object with average, personal records, or solves/averages based on query parameters

### Version API

#### `GET /api/version`

Returns the application version.

- **Response**: `{ version: "x.x.x" }`

### Status API

#### `POST /api/status`

Returns server status including uptime, memory usage, and log analytics.

- **Request Body**:
  - `password`: SHA-256 hashed password for authentication
- **Response**: JSON object with uptime, memory usage, log file size, and traffic statistics

### Tools API

#### `GET /api/tools`

Returns metadata for all available HTML tools.

- **Response**: JSON array of tools with `filename`, `title`, and `description`

### Page Routes

#### `GET /`
Serves the main page.

#### `GET /status`
Serves the status report page.

#### `GET /privacy-policy`
Serves the privacy policy page.

#### `GET /404`
Serves the 404 error page.

### Static Asset Routes

#### `GET /robots.txt`
Serves the robots.txt file.

#### `GET /sitemap.xml`
Serves the sitemap.xml file.

#### `GET /apple-touch-icon.png`
Serves the Apple touch icon.

#### `GET /googlea20166777fc211f6.html`
Serves Google verification file.

### Tool Routes

#### `GET /tools/:toolName`
Serves an HTML tool page.

#### `GET /css/:cssName`
Serves a tool's CSS file.

#### `GET /js/:jsName`
Serves a tool's JavaScript file.

#### `GET /assets/:assetName`
Serves a tool's asset file.

#### `GET *`
Catch-all route that redirects to 404 with the requested path as a query parameter.

---

Ensure the `.env` file contains required environment variables like `STATUS_PAGE_PASSWORD`.

