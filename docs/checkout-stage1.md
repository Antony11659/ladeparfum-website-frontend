# Checkout Stage 1

The `/checkout` route reuses cart context, pricing helpers, and CartPromo. No orders, shipments, or payments are created.

## Delivery API configuration is pending verification

On November 15, 2026, the deployed host `https://api.adminparfuma.ru` returned 404 for `/docs`, `/openapi.json`, `/api/docs`, `/api/openapi.json`, `/swagger`, `/swagger-json`, `/api-json`, and the checked trailing-slash/schema variants. The exact delivery prefix could not be verified against deployed documentation.

Delivery is deliberately disabled until that requirement is met. Obtain the deployed documentation and verify the public prefix and contracts before setting the public Vite variable `VITE_DELIVERY_API_BASE_URL` to the full delivery base URL. This variable contains only a public URL, never credentials. Restart Vite or rebuild after setting it.

The adapter appends these contract suffixes to that verified base:

- `GET /address-suggestions?query=...`
- `POST /check-client` with `{ phone }`
- `POST /verify-pvz` with selected `{ latitude, longitude }`
- `POST /checkout` with `{ phone, deliveryPointId, declaredValue }`

These suffixes follow the task specification; they are not claimed to be verified deployed routes. Product and price reads and promo validation retain the existing API URLs and behavior.

The delivery flow checks a valid phone on form submission, debounces address search by 300 ms, requires selecting a returned address, verifies a real returned pickup ID, and requests an estimate only after pickup confirmation and valid cart pricing. Address/contact changes discard pickup and estimate state. Pricing changes invalidate the displayed estimate. Requests time out after 12 seconds; canceled or outdated responses are ignored. Customer delivery price is read from the response, including zero, rather than hardcoded. Displayed totals are estimates only.

Customer contact and address data remain in React state. Payment stays disabled with a visible coming-soon explanation.
