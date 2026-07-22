import type { Airport } from '../types'

export const AIRPORTS: Airport[] = [
  { code: 'GRU', city: 'São Paulo', name: 'Aeroporto Internacional de Guarulhos', country: 'Brasil', latitude: -23.435556, longitude: -46.473057 },
  { code: 'CGH', city: 'São Paulo', name: 'Aeroporto de Congonhas', country: 'Brasil', latitude: -23.62611, longitude: -46.656387 },
  { code: 'VCP', city: 'Campinas', name: 'Aeroporto Internacional de Viracopos', country: 'Brasil', latitude: -23.007401, longitude: -47.134499 },
  { code: 'GIG', city: 'Rio de Janeiro', name: 'Aeroporto Internacional do Galeão', country: 'Brasil', latitude: -22.809999, longitude: -43.250557 },
  { code: 'SDU', city: 'Rio de Janeiro', name: 'Aeroporto Santos Dumont', country: 'Brasil', latitude: -22.9105, longitude: -43.163101 },
  { code: 'BSB', city: 'Brasília', name: 'Aeroporto Internacional de Brasília', country: 'Brasil', latitude: -15.869167, longitude: -47.920834 },
  { code: 'CNF', city: 'Belo Horizonte', name: 'Aeroporto Internacional de Confins', country: 'Brasil', latitude: -19.624443, longitude: -43.971943 },
  { code: 'SSA', city: 'Salvador', name: 'Aeroporto Internacional de Salvador', country: 'Brasil', latitude: -12.908611, longitude: -38.322498 },
  { code: 'REC', city: 'Recife', name: 'Aeroporto Internacional do Recife', country: 'Brasil', latitude: -8.12649, longitude: -34.923599 },
  { code: 'FOR', city: 'Fortaleza', name: 'Aeroporto Internacional Pinto Martins', country: 'Brasil', latitude: -3.77628, longitude: -38.5326 },
  { code: 'POA', city: 'Porto Alegre', name: 'Aeroporto Internacional Salgado Filho', country: 'Brasil', latitude: -29.9944, longitude: -51.171398 },
  { code: 'FLN', city: 'Florianópolis', name: 'Aeroporto Internacional Hercílio Luz', country: 'Brasil', latitude: -27.670279, longitude: -48.552502 },
  { code: 'LIS', city: 'Lisboa', name: 'Aeroporto Humberto Delgado', country: 'Portugal', latitude: 38.7813, longitude: -9.13592 },
  { code: 'OPO', city: 'Porto', name: 'Aeroporto Francisco Sá Carneiro', country: 'Portugal', latitude: 41.2481, longitude: -8.68139 },
  { code: 'MAD', city: 'Madri', name: 'Aeroporto Adolfo Suárez Madrid-Barajas', country: 'Espanha', latitude: 40.471926, longitude: -3.56264 },
  { code: 'BCN', city: 'Barcelona', name: 'Aeroporto Josep Tarradellas Barcelona-El Prat', country: 'Espanha', latitude: 41.2971, longitude: 2.07846 },
  { code: 'CDG', city: 'Paris', name: 'Aeroporto Charles de Gaulle', country: 'França', latitude: 49.012798, longitude: 2.55 },
  { code: 'LHR', city: 'Londres', name: 'Aeroporto de Heathrow', country: 'Reino Unido', latitude: 51.4706, longitude: -0.461941 },
  { code: 'FCO', city: 'Roma', name: 'Aeroporto Leonardo da Vinci-Fiumicino', country: 'Itália', latitude: 41.800278, longitude: 12.238889 },
  { code: 'AMS', city: 'Amsterdã', name: 'Aeroporto de Schiphol', country: 'Holanda', latitude: 52.308601, longitude: 4.76389 },
  { code: 'FRA', city: 'Frankfurt', name: 'Aeroporto de Frankfurt', country: 'Alemanha', latitude: 50.033333, longitude: 8.570556 },
  { code: 'JFK', city: 'Nova York', name: 'Aeroporto Internacional John F. Kennedy', country: 'Estados Unidos', latitude: 40.639801, longitude: -73.7789 },
  { code: 'MIA', city: 'Miami', name: 'Aeroporto Internacional de Miami', country: 'Estados Unidos', latitude: 25.7932, longitude: -80.290604 },
  { code: 'MCO', city: 'Orlando', name: 'Aeroporto Internacional de Orlando', country: 'Estados Unidos', latitude: 28.429399, longitude: -81.308998 },
  { code: 'EZE', city: 'Buenos Aires', name: 'Aeroporto Internacional de Ezeiza', country: 'Argentina', latitude: -34.8222, longitude: -58.5358 },
  { code: 'SCL', city: 'Santiago', name: 'Aeroporto Internacional Arturo Merino Benítez', country: 'Chile', latitude: -33.393002, longitude: -70.785797 },
  { code: 'PTY', city: 'Cidade do Panamá', name: 'Aeroporto Internacional de Tocumen', country: 'Panamá', latitude: 9.07136, longitude: -79.383499 },
  { code: 'DXB', city: 'Dubai', name: 'Aeroporto Internacional de Dubai', country: 'Emirados Árabes', latitude: 25.2528, longitude: 55.364399 },
]

export function findAirport(code: string): Airport {
  const airport = AIRPORTS.find((a) => a.code === code)
  if (!airport) throw new Error(`Aeroporto desconhecido: ${code}`)
  return airport
}
