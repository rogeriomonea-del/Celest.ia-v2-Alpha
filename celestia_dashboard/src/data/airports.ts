import type { Airport } from '../types'

export const AIRPORTS: Airport[] = [
  { code: 'GRU', city: 'São Paulo', name: 'Aeroporto Internacional de Guarulhos', country: 'Brasil' },
  { code: 'CGH', city: 'São Paulo', name: 'Aeroporto de Congonhas', country: 'Brasil' },
  { code: 'VCP', city: 'Campinas', name: 'Aeroporto Internacional de Viracopos', country: 'Brasil' },
  { code: 'GIG', city: 'Rio de Janeiro', name: 'Aeroporto Internacional do Galeão', country: 'Brasil' },
  { code: 'SDU', city: 'Rio de Janeiro', name: 'Aeroporto Santos Dumont', country: 'Brasil' },
  { code: 'BSB', city: 'Brasília', name: 'Aeroporto Internacional de Brasília', country: 'Brasil' },
  { code: 'CNF', city: 'Belo Horizonte', name: 'Aeroporto Internacional de Confins', country: 'Brasil' },
  { code: 'SSA', city: 'Salvador', name: 'Aeroporto Internacional de Salvador', country: 'Brasil' },
  { code: 'REC', city: 'Recife', name: 'Aeroporto Internacional do Recife', country: 'Brasil' },
  { code: 'FOR', city: 'Fortaleza', name: 'Aeroporto Internacional Pinto Martins', country: 'Brasil' },
  { code: 'POA', city: 'Porto Alegre', name: 'Aeroporto Internacional Salgado Filho', country: 'Brasil' },
  { code: 'FLN', city: 'Florianópolis', name: 'Aeroporto Internacional Hercílio Luz', country: 'Brasil' },
  { code: 'LIS', city: 'Lisboa', name: 'Aeroporto Humberto Delgado', country: 'Portugal' },
  { code: 'OPO', city: 'Porto', name: 'Aeroporto Francisco Sá Carneiro', country: 'Portugal' },
  { code: 'MAD', city: 'Madri', name: 'Aeroporto Adolfo Suárez Madrid-Barajas', country: 'Espanha' },
  { code: 'BCN', city: 'Barcelona', name: 'Aeroporto Josep Tarradellas Barcelona-El Prat', country: 'Espanha' },
  { code: 'CDG', city: 'Paris', name: 'Aeroporto Charles de Gaulle', country: 'França' },
  { code: 'LHR', city: 'Londres', name: 'Aeroporto de Heathrow', country: 'Reino Unido' },
  { code: 'FCO', city: 'Roma', name: 'Aeroporto Leonardo da Vinci-Fiumicino', country: 'Itália' },
  { code: 'AMS', city: 'Amsterdã', name: 'Aeroporto de Schiphol', country: 'Holanda' },
  { code: 'FRA', city: 'Frankfurt', name: 'Aeroporto de Frankfurt', country: 'Alemanha' },
  { code: 'JFK', city: 'Nova York', name: 'Aeroporto Internacional John F. Kennedy', country: 'Estados Unidos' },
  { code: 'MIA', city: 'Miami', name: 'Aeroporto Internacional de Miami', country: 'Estados Unidos' },
  { code: 'MCO', city: 'Orlando', name: 'Aeroporto Internacional de Orlando', country: 'Estados Unidos' },
  { code: 'EZE', city: 'Buenos Aires', name: 'Aeroporto Internacional de Ezeiza', country: 'Argentina' },
  { code: 'SCL', city: 'Santiago', name: 'Aeroporto Internacional Arturo Merino Benítez', country: 'Chile' },
  { code: 'PTY', city: 'Cidade do Panamá', name: 'Aeroporto Internacional de Tocumen', country: 'Panamá' },
  { code: 'DXB', city: 'Dubai', name: 'Aeroporto Internacional de Dubai', country: 'Emirados Árabes' },
]

export function findAirport(code: string): Airport {
  const airport = AIRPORTS.find((a) => a.code === code)
  if (!airport) throw new Error(`Aeroporto desconhecido: ${code}`)
  return airport
}
