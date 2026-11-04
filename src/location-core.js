export const locationDefaults = { enabled: false, latitude: 40.4237, longitude: -86.9212, accuracy: 10, profiles: [] };
export function coordinates(latitude, longitude, accuracy) {
  const values = [latitude, longitude, accuracy];
  if (values.some(v => v === '' || v === null || v === undefined || !Number.isFinite(Number(v)))) throw new Error('Enter valid numeric coordinates and accuracy.');
  const [lat, lon, acc] = values.map(Number);
  if (lat < -90 || lat > 90) throw new Error('Latitude must be between −90 and 90.');
  if (lon < -180 || lon > 180) throw new Error('Longitude must be between −180 and 180.');
  if (acc <= 0 || acc > 100000) throw new Error('Accuracy must be greater than zero and at most 100,000 meters.');
  return { latitude: lat, longitude: lon, accuracy: acc };
}
export function pointToCoordinates(x, y) {
  return { latitude: Number((90 - Math.max(0, Math.min(1, y)) * 180).toFixed(5)), longitude: Number((Math.max(0, Math.min(1, x)) * 360 - 180).toFixed(5)) };
}

export function parseLocation(input, accuracy = 10) {
  const value = input.trim();
  const pair = /^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/;
  const direct = value.match(pair);
  if (direct) return coordinates(direct[1], direct[2], accuracy);
  let url;
  try { url = new URL(value); } catch { throw new Error('Paste coordinates or a full Google Maps link.'); }
  if (url.protocol !== 'https:' || !/^(?:www\.|maps\.)?google\.(?:com|co\.uk|ca|com\.au)$/.test(url.hostname)) throw new Error('Use a full google.com/maps link with coordinates. Open shortened links in Google Maps first.');
  // A place pin is more precise than the map camera center in /@lat,lng URLs.
  const pin = url.pathname.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  const query = ['query', 'q', 'll'].map(key => url.searchParams.get(key)?.match(pair)).find(Boolean);
  const center = url.pathname.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  const match = pin || query || center;
  if (!match) throw new Error('This link has no coordinates. In Google Maps, right-click the point and copy its coordinates.');
  return coordinates(match[1], match[2], accuracy);
}
