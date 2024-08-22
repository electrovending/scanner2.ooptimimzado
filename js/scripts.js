const convertirDatos = (datos) => {
  return datos.map(arr => ({
    time: parseInt(parseFloat(arr[0]) / 1000),
    open: parseFloat(arr[1]),
    high: parseFloat(arr[2]),
    low: parseFloat(arr[3]),
    close: parseFloat(arr[4]),
    volume: parseFloat(arr[5]),
  })).reverse();
};

const fetchKline = async (symbol) => {
  const url = `https://api.bybit.com/v5/market/kline?category=linear&symbol=${symbol}&interval=1`;
  const response = await fetch(url);
  const data = await response.json();
  const kline = data.result.list;
  const numericValues = kline.map(entry => parseFloat(entry[1]));

  // Calculate both EMAs separately
  const ema59 = EMA(numericValues, 59);
  const ema200 = EMA(numericValues, 200);

  // Calculate EMA distance using the 200-period EMA
  const emaDist = ((numericValues[0] - ema200[0]) / numericValues[0]) * 100;

  signals(kline, symbol, emaDist);
  return { symbol, EMA_dist: emaDist };
};

var chart = null;
var series = null;
var ema59Series = null;
var ema200Series = null;
var volumeSeries = null;

const analyzeCoins = async () => {
  const coinsResponse = await fetch('https://api.bybit.com/v5/market/instruments-info?category=linear');
  const coinsData = await coinsResponse.json();
  const coins = coinsData.result.list.filter(coin => coin.status === 'Trading').map(coin => coin.symbol);

  const results = await Promise.all(coins.map(coin => fetchKline(coin)));
  const positiveDF = results.filter(({ EMA_dist }) => EMA_dist > 0).sort((a, b) => b.EMA_dist - a.EMA_dist).slice(0, 10);
  const negativeDF = results.filter(({ EMA_dist }) => EMA_dist < 0).sort((a, b) => a.EMA_dist - b.EMA_dist).slice(0, 10);

  populateTable('positiveTable', positiveDF);
  populateTable('negativeTable', negativeDF);
};

const set_symbol = (symbol) => {
  document.getElementById('symbol').textContent = symbol;
}

const populateTable = (tableId, data) => {
  const tableBody = document.getElementById(tableId).getElementsByTagName('tbody')[0];

  tableBody.innerHTML = '';  // Limpiar el cuerpo de la tabla antes de agregar nuevos datos

  data.forEach(({ symbol, EMA_dist }) => {
    const row = tableBody.insertRow();
    const cell1 = row.insertCell(0);
    const cell2 = row.insertCell(1);
    cell1.textContent = symbol;
    row.onclick = () => graph(series, symbol, ema59Series, ema200Series, volumeSeries);
    cell2.textContent = `${EMA_dist.toFixed(2)}%`;  // round to 2 decimal places and add % symbol
    row.style.cursor = 'pointer';
  });
};

const signals = (kline, symbol, emaDist) => {
  const ordered = convertirDatos(kline).reverse();
  const rsi = RSI(ordered.map(entry => entry.open), 14);
  console.log('calculating.......');
  
  if (rsi[0] < rsi[1] && rsi[1] > 80 && emaDist > 3) {
    notifyMe(symbol, 'SHORT ⛔');
    console.log(symbol, emaDist);
  } else if (rsi[0] > rsi[1] && rsi[1] < 20 && emaDist < -3) {
    notifyMe(symbol, 'LONG 🟢');
    console.log(symbol, emaDist);
  }
}

const graph = async (series, symbol, ema59Series, ema200Series, volumeSeries) => {
  set_symbol(symbol);
  const url = `https://api.bybit.com/v5/market/kline?category=linear&symbol=${symbol}&interval=1`;
  const response = await fetch(url);
  const data = await response.json();
  const kline = data.result.list;
  const datosConv1 = convertirDatos(kline);

  const numericValues = kline.map(entry => parseFloat(entry[1]));

  // Calculate both EMAs
  const ema59 = EMA(numericValues, 59).reverse();
  const ema200 = EMA(numericValues, 200).reverse();

  // Prepare EMA data for graphing
  const ema59Data = datosConv1.slice(0, ema59.length).map((entry, index) => ({
    time: entry.time,
    value: ema59[index],  // 59-period EMA
  }));

  const ema200Data = datosConv1.slice(0, ema200.length).map((entry, index) => ({
    time: entry.time,
    value: ema200[index],  // 200-period EMA
  }));

  // Prepare volume data for graphing
  const volumeData = datosConv1.map(entry => ({
    time: entry.time,
    value: entry.volume,
  }));

  // Update chart series with EMA and volume data
  series.setData(datosConv1);
  volumeSeries.setData(volumeData);
  ema59Series.setData(ema59Data);  // Set 59-period EMA data
  ema200Series.setData(ema200Data);  // Set 200-period EMA data
}

const graphSeries = async (symbol) => {
  chart = LightweightCharts.createChart(document.getElementById('chart'), {
    width: 800,
    height: 400,
    watermark: {
      visible: true,
      fontSize: 50,
      horzAlign: 'center',
      vertAlign: 'center',
      color: 'rgba(171, 71, 188, 0.5)',
      text: 'TRADING M1',
    },
    timeScale: {
      timeVisible: true,
      borderColor: '#D1D4DC',
    },
    rightPriceScale: {
      borderColor: '#D1D4DC',
    },
    layout: {
      background: {
        type: 'solid',
        color: '#000',
      },
      textColor: '#FFFFFF',
    },
    grid: {
      horzLines: {
        color: '#ffffff20',
      },
      vertLines: {
        color: '#f0f3fa1a',
      },
    },
  });

  chart.applyOptions({
    priceFormat: {
      type: 'custom',
      minMove: '0.0000001',
      formatter: (price) => {
        if (price < 0.001) return parseFloat(price).toFixed(8);
        else if (price >= 0.001 && price < 1) return parseFloat(price).toFixed(5);
        else return parseFloat(price);
      }
    },
    priceScale: {
      autoScale: true,
    },
    localization: {
      locale: 'en-US',
      priceFormatter: (price) => {
        if (price < 0.001) return parseFloat(price).toFixed(8);
        else if (price >= 0.001 && price < 1) return parseFloat(price).toFixed(6);
        else return parseFloat(price);
      }
    },
  });

  series = chart.addCandlestickSeries({
    upColor: 'rgb(38,166,154)',
    downColor: 'rgb(255,82,82)',
    wickUpColor: 'rgb(38,166,154)',
    wickDownColor: 'rgb(255,82,82)',
    borderVisible: false,
  });

  ema59Series = chart.addLineSeries({
    color: 'rgba(255, 255, 0, 0.769)',  // Different color for 59-period EMA
    lineWidth: 2,
  });

  ema200Series = chart.addLineSeries({
    color: 'rgba(255, 255, 255, 0.769)',  // Different color for 200-period EMA
    lineWidth: 2,
  });

  volumeSeries = chart.addHistogramSeries({
    color: '#26a69a',
    priceFormat: {
      type: 'volume',
    },
    priceScaleId: '',
  });

  chart.priceScale('').applyOptions({
    scaleMargins: {
      top: 0.8,
      bottom: 0,
    },
  });

  graph(series, symbol, ema59Series, ema200Series, volumeSeries);
}

// Request permission on page load
document.addEventListener('DOMContentLoaded', function() {
  if (!Notification) {
    alert('Desktop notifications not available in your browser.');
    return;
  }

  if (Notification.permission !== 'granted') {
    Notification.requestPermission();
  }
});

// Notification function
function notifyMe(symbol, message) {
  if (Notification.permission !== 'granted') {
    Notification.requestPermission();
  } else {
    var notification = new Notification(symbol + ' ALERTA optimizada 🚨! ⚠️', {
      icon: '/assets/favicon.ico',
      body: '' + message,
    });
    notification.onclick = function() {
      window.open('/');
    };
  }
}

const loopFunct = () => {
  analyzeCoins();
}

window.onload = (event) => {
  graphSeries('ETHUSDT');
  loopFun
