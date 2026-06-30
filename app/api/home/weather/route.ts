export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const lat = searchParams.get('lat')
  const lon = searchParams.get('lon')

  const url =
    lat && lon
      ? `https://wttr.in/${lat},${lon}?format=j1`
      : `https://wttr.in/?format=j1`

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 8000)

    let res: Response
    try {
      res = await fetch(url, { signal: controller.signal })
    } finally {
      clearTimeout(timeoutId)
    }

    if (!res.ok) {
      return Response.json({ error: 'unavailable' }, { status: 200 })
    }

    const data = await res.json()

    const current = data.current_condition?.[0]
    const area = data.nearest_area?.[0]

    if (!current || !area) {
      return Response.json({ error: 'unavailable' }, { status: 200 })
    }

    const result = {
      temp: Number(current.temp_C),
      feelsLike: Number(current.FeelsLikeC),
      humidity: Number(current.humidity),
      condition: current.weatherDesc?.[0]?.value ?? '',
      city: area.areaName?.[0]?.value ?? '',
      country: area.country?.[0]?.value ?? '',
    }

    return Response.json(result, {
      status: 200,
      headers: {
        'Cache-Control': 'max-age=1800',
      },
    })
  } catch {
    return Response.json({ error: 'unavailable' }, { status: 200 })
  }
}
