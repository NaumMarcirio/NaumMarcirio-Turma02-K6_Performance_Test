import { htmlReport } from 'https://raw.githubusercontent.com/benc-uk/k6-reporter/main/dist/bundle.js';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.1/index.js';
import http from 'k6/http';
import { check } from 'k6';
import { Trend, Rate } from 'k6/metrics';

// Métricas
export const getBookingDuration = new Trend('get_booking_duration', true);
export const rateStatusCodeOK = new Rate('rate_status_code_ok');
export const authDuration = new Trend('auth_duration', true);
export const createBookingDuration = new Trend("create_booking_duration");

// Configurações do teste
export const options = {
  thresholds: {
    http_req_failed: ['rate<0.12'], 
    get_booking_duration: ['p(95)<5700'], 
    rate_status_code_ok: ['rate>0.95'] 
  },
  stages: [
    { duration: '30s', target: 10 },   
    { duration: '4m', target: 300 },   
    { duration: '30s', target: 0 }     
  ]
};

// Relatórios
export function handleSummary(data) {
  return {
    './src/output/index.html': htmlReport(data),
    stdout: textSummary(data, { indent: ' ', enableColors: true })
  };
}

// Função principal do teste
export default function () {
  const baseUrl = 'https://restful-booker.herokuapp.com';
  const params = {
    headers: {
      'Content-Type': 'application/json'
    }
  };
  const OK = 200;

  // Teste POST: Autenticação
  const authRes = http.post(`${baseUrl}/auth`, JSON.stringify({
    username: 'admin',
    password: 'password123',
  }), params);

  authDuration.add(authRes.timings.duration);
  rateStatusCodeOK.add(authRes.status === OK);
  check(authRes, {
    'POST Auth - Status 200': () => authRes.status === OK,
    'POST Auth - Token presente': () => {
      let body;
      try {
        body = JSON.parse(authRes.body);
      } catch (e) {
        return false;
      }
      return body && body.token && typeof body.token === 'string';
    },
  });

  // Teste GET: Lista de Recursos
  const listRes = http.get(`${baseUrl}/booking`, params);
  getBookingDuration.add(listRes.timings.duration);
  rateStatusCodeOK.add(listRes.status === OK);
  check(listRes, {
    'GET Lista - Status 200': () => listRes.status === OK,
    'GET Lista - Resposta contém itens': () => {
      let parsedBody;
      try {
        parsedBody = JSON.parse(listRes.body);
      } catch (e) {
        return false; // Se não for um JSON válido, a verificação falha.
      }
      return parsedBody && parsedBody.length > 0;
    },
  });

  // Teste GET: Buscar Booking Específico
  const bookingId = 1; // Substitua pelo ID desejado
  const specificBookingRes = http.get(`${baseUrl}/booking/${bookingId}`, {
    headers: { Accept: 'application/json' },
  });

  getBookingDuration.add(specificBookingRes.timings.duration);
  rateStatusCodeOK.add(specificBookingRes.status === OK);
  check(specificBookingRes, {
    'GET Booking - Status 200': () => specificBookingRes.status === OK,
    'GET Booking - Resposta contém detalhes corretos': () => {
      let body;
      try {
        body = JSON.parse(specificBookingRes.body);
      } catch (e) {
        return false; // Se não for um JSON válido, a verificação falha.
      }
      return (
        body.firstname &&
        body.lastname &&
        typeof body.totalprice === 'number' &&
        typeof body.depositpaid === 'boolean' &&
        body.bookingdates &&
        body.bookingdates.checkin &&
        body.bookingdates.checkout
      );
    },
  });

  // Teste POST: Criar Booking
  const payload = JSON.stringify({
    firstname: "Naum",
    lastname: "Marcirio",
    totalprice: 111,
    depositpaid: true,
    bookingdates: {
      checkin: "2018-01-01",
      checkout: "2019-01-01",
    },
    additionalneeds: "Breakfast",
  });

  const createBookingRes = http.post(`${baseUrl}/booking`, payload, {
    headers: { 
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  });

  createBookingDuration.add(createBookingRes.timings.duration);
  rateStatusCodeOK.add(createBookingRes.status === OK);
  check(createBookingRes, {
    'POST Booking - Status 200': () => createBookingRes.status === OK,
    'POST Booking - Resposta contém bookingId e detalhes': () => {
      let body;
      try {
        body = JSON.parse(createBookingRes.body);
      } catch (e) {
        return false; // Se não for um JSON válido, a verificação falha.
      }
      return (
        body.bookingid &&
        body.booking &&
        body.booking.firstname === "Naum" &&
        body.booking.lastname === "Marcirio" &&
        body.booking.totalprice === 111 &&
        body.booking.depositpaid === true &&
        body.booking.bookingdates &&
        body.booking.bookingdates.checkin === "2018-01-01" &&
        body.booking.bookingdates.checkout === "2019-01-01" &&
        body.booking.additionalneeds === "Breakfast"
      );
    },
  });
}
