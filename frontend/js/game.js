// Kingdom Conquest - Game Client
const API_URL = window.location.origin + "/api";
const WS_URL = `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/ws`;

let token = localStorage.getItem("token");
let currentUser = JSON.parse(localStorage.getItem("user") || "null");
let kingdoms = [];
let kingdomBorders = {};
let troops = {}; // Keyed by country_id -> { central: number, borders: {N,S,E,W: number} }
let myKingdom = null;
let selectedKingdomId = null;
let shownKingdomId = null; // kingdom id currently shown in the info popup
let ws = null;
let currentTick = 0;
let loggedOut = false;
let heartbeatTimer = null;
let authBusy = false;
let actionBusy = false;
let lastLoggedActionKey = null;

// Canvas setup
const canvas = document.getElementById("world-map");
const ctx = canvas.getContext("2d");
let canvasWidth, canvasHeight;

// Map projection data (simplified medieval Europe)
// Polygons generated with 25-75 sides per country
// Side count affects border width/color in renderMap()
const kingdomPolygons = {
  ENG: [
    [0.286, 0.288],
    [0.292, 0.298],
    [0.298, 0.308],
    [0.306, 0.318],
    [0.302, 0.326],
    [0.296, 0.33],
    [0.306, 0.338],
    [0.302, 0.344],
    [0.316, 0.346],
    [0.322, 0.356],
    [0.318, 0.368],
    [0.306, 0.376],
    [0.318, 0.382],
    [0.316, 0.392],
    [0.304, 0.398],
    [0.29, 0.402],
    [0.276, 0.404],
    [0.262, 0.408],
    [0.248, 0.412],
    [0.234, 0.418],
    [0.22, 0.422],
    [0.226, 0.41],
    [0.238, 0.402],
    [0.252, 0.394],
    [0.238, 0.39],
    [0.224, 0.388],
    [0.214, 0.384],
    [0.224, 0.372],
    [0.218, 0.36],
    [0.222, 0.35],
    [0.236, 0.352],
    [0.244, 0.344],
    [0.242, 0.332],
    [0.238, 0.318],
    [0.244, 0.304],
    [0.252, 0.302],
    [0.26, 0.299],
    [0.268, 0.295],
    [0.275, 0.293],
    [0.281, 0.29],
  ],
  SCO: [
    [0.286, 0.288],
    [0.282, 0.28],
    [0.27, 0.276],
    [0.278, 0.27],
    [0.274, 0.262],
    [0.284, 0.254],
    [0.292, 0.244],
    [0.296, 0.234],
    [0.284, 0.23],
    [0.27, 0.232],
    [0.278, 0.222],
    [0.274, 0.212],
    [0.28, 0.202],
    [0.268, 0.196],
    [0.254, 0.198],
    [0.24, 0.2],
    [0.234, 0.21],
    [0.228, 0.22],
    [0.222, 0.23],
    [0.23, 0.238],
    [0.224, 0.248],
    [0.232, 0.256],
    [0.224, 0.268],
    [0.234, 0.272],
    [0.238, 0.282],
    [0.23, 0.292],
    [0.236, 0.3],
    [0.244, 0.304],
    [0.252, 0.302],
    [0.26, 0.299],
    [0.268, 0.295],
    [0.275, 0.293],
    [0.281, 0.29],
  ],
  IRL: [
    [0.168, 0.298],
    [0.178, 0.302],
    [0.188, 0.306],
    [0.194, 0.314],
    [0.198, 0.324],
    [0.194, 0.334],
    [0.197, 0.344],
    [0.196, 0.354],
    [0.199, 0.364],
    [0.196, 0.376],
    [0.188, 0.386],
    [0.178, 0.394],
    [0.166, 0.402],
    [0.154, 0.406],
    [0.142, 0.402],
    [0.136, 0.394],
    [0.132, 0.384],
    [0.14, 0.376],
    [0.136, 0.366],
    [0.144, 0.358],
    [0.134, 0.35],
    [0.132, 0.34],
    [0.138, 0.33],
    [0.146, 0.324],
    [0.142, 0.314],
    [0.146, 0.306],
    [0.156, 0.3],
    [0.162, 0.302],
  ],
  FRA: [
    [0.256, 0.592],
    [0.258, 0.578],
    [0.26, 0.564],
    [0.264, 0.55],
    [0.26, 0.538],
    [0.254, 0.526],
    [0.248, 0.514],
    [0.238, 0.504],
    [0.228, 0.494],
    [0.22, 0.484],
    [0.224, 0.472],
    [0.236, 0.468],
    [0.25, 0.472],
    [0.262, 0.476],
    [0.26, 0.46],
    [0.272, 0.458],
    [0.284, 0.466],
    [0.298, 0.462],
    [0.308, 0.45],
    [0.32, 0.442],
    [0.33, 0.43],
    [0.346, 0.422],
    [0.366, 0.418],
    [0.376, 0.426],
    [0.386, 0.434],
    [0.396, 0.442],
    [0.408, 0.45],
    [0.418, 0.46],
    [0.426, 0.472],
    [0.422, 0.486],
    [0.428, 0.5],
    [0.425, 0.512],
    [0.43, 0.524],
    [0.434, 0.536],
    [0.431, 0.546],
    [0.435, 0.556],
    [0.431, 0.568],
    [0.433, 0.579],
    [0.43, 0.59],
    [0.42, 0.596],
    [0.408, 0.602],
    [0.396, 0.598],
    [0.384, 0.594],
    [0.372, 0.596],
    [0.36, 0.602],
    [0.35, 0.608],
    [0.342, 0.616],
    [0.334, 0.615],
    [0.326, 0.613],
    [0.318, 0.611],
    [0.31, 0.609],
    [0.302, 0.606],
    [0.294, 0.604],
    [0.287, 0.602],
    [0.28, 0.6],
    [0.272, 0.597],
    [0.264, 0.595],
  ],
  ESP: [
    [0.146, 0.638],
    [0.142, 0.628],
    [0.138, 0.618],
    [0.134, 0.606],
    [0.138, 0.594],
    [0.148, 0.586],
    [0.16, 0.588],
    [0.172, 0.586],
    [0.184, 0.589],
    [0.196, 0.588],
    [0.208, 0.586],
    [0.22, 0.588],
    [0.232, 0.59],
    [0.244, 0.591],
    [0.256, 0.592],
    [0.264, 0.595],
    [0.272, 0.597],
    [0.28, 0.6],
    [0.287, 0.602],
    [0.294, 0.604],
    [0.289, 0.613],
    [0.284, 0.622],
    [0.279, 0.631],
    [0.273, 0.64],
    [0.268, 0.65],
    [0.256, 0.653],
    [0.244, 0.656],
    [0.232, 0.654],
    [0.22, 0.658],
    [0.208, 0.655],
    [0.196, 0.659],
    [0.184, 0.656],
    [0.177, 0.648],
    [0.17, 0.642],
    [0.162, 0.64],
    [0.154, 0.637],
  ],
  POR: [
    [0.176, 0.796],
    [0.166, 0.798],
    [0.154, 0.796],
    [0.144, 0.792],
    [0.146, 0.778],
    [0.148, 0.764],
    [0.146, 0.75],
    [0.138, 0.74],
    [0.134, 0.728],
    [0.138, 0.714],
    [0.142, 0.7],
    [0.144, 0.686],
    [0.146, 0.672],
    [0.147, 0.658],
    [0.146, 0.648],
    [0.146, 0.638],
    [0.154, 0.637],
    [0.162, 0.64],
    [0.17, 0.642],
    [0.177, 0.648],
    [0.184, 0.656],
    [0.182, 0.672],
    [0.185, 0.688],
    [0.181, 0.704],
    [0.186, 0.72],
    [0.182, 0.736],
    [0.186, 0.752],
    [0.183, 0.768],
    [0.179, 0.782],
  ],
  CAS: [
    [0.184, 0.656],
    [0.182, 0.672],
    [0.185, 0.688],
    [0.181, 0.704],
    [0.186, 0.72],
    [0.182, 0.736],
    [0.186, 0.752],
    [0.183, 0.768],
    [0.179, 0.782],
    [0.176, 0.796],
    [0.29, 0.764],
    [0.284, 0.776],
    [0.274, 0.788],
    [0.266, 0.8],
    [0.252, 0.804],
    [0.238, 0.806],
    [0.224, 0.81],
    [0.212, 0.818],
    [0.202, 0.83],
    [0.192, 0.824],
    [0.186, 0.814],
    [0.182, 0.804],
    [0.176, 0.796],
    [0.29, 0.764],
    [0.287, 0.75],
    [0.284, 0.735],
    [0.279, 0.72],
    [0.282, 0.706],
    [0.276, 0.692],
    [0.279, 0.678],
    [0.274, 0.664],
    [0.268, 0.65],
    [0.256, 0.653],
    [0.244, 0.656],
    [0.232, 0.654],
    [0.22, 0.658],
    [0.208, 0.655],
    [0.196, 0.659],
  ],
  ARA: [
    [0.268, 0.65],
    [0.273, 0.64],
    [0.279, 0.631],
    [0.284, 0.622],
    [0.289, 0.613],
    [0.294, 0.604],
    [0.302, 0.606],
    [0.31, 0.609],
    [0.318, 0.611],
    [0.326, 0.613],
    [0.334, 0.615],
    [0.342, 0.616],
    [0.34, 0.628],
    [0.332, 0.64],
    [0.322, 0.652],
    [0.316, 0.664],
    [0.308, 0.676],
    [0.302, 0.69],
    [0.296, 0.704],
    [0.298, 0.718],
    [0.304, 0.73],
    [0.298, 0.742],
    [0.294, 0.754],
    [0.29, 0.764],
    [0.287, 0.75],
    [0.284, 0.735],
    [0.279, 0.72],
    [0.282, 0.706],
    [0.276, 0.692],
    [0.279, 0.678],
    [0.274, 0.664],
  ],
  HRE: [
    [0.366, 0.418],
    [0.372, 0.406],
    [0.38, 0.394],
    [0.388, 0.382],
    [0.398, 0.388],
    [0.406, 0.376],
    [0.42, 0.374],
    [0.434, 0.376],
    [0.448, 0.372],
    [0.446, 0.356],
    [0.444, 0.34],
    [0.456, 0.334],
    [0.464, 0.348],
    [0.476, 0.354],
    [0.492, 0.348],
    [0.508, 0.342],
    [0.524, 0.346],
    [0.54, 0.345],
    [0.554, 0.344],
    [0.558, 0.358],
    [0.555, 0.372],
    [0.56, 0.386],
    [0.564, 0.4],
    [0.56, 0.414],
    [0.566, 0.428],
    [0.572, 0.442],
    [0.568, 0.458],
    [0.573, 0.473],
    [0.576, 0.488],
    [0.578, 0.498],
    [0.572, 0.508],
    [0.564, 0.516],
    [0.556, 0.522],
    [0.548, 0.528],
    [0.54, 0.527],
    [0.53, 0.525],
    [0.52, 0.526],
    [0.51, 0.524],
    [0.5, 0.526],
    [0.489, 0.528],
    [0.478, 0.532],
    [0.467, 0.53],
    [0.456, 0.535],
    [0.445, 0.532],
    [0.434, 0.536],
    [0.43, 0.524],
    [0.425, 0.512],
    [0.428, 0.5],
    [0.422, 0.486],
    [0.426, 0.472],
    [0.418, 0.46],
    [0.408, 0.45],
    [0.396, 0.442],
    [0.386, 0.434],
    [0.376, 0.426],
  ],
  ITA: [
    [0.43, 0.59],
    [0.433, 0.579],
    [0.431, 0.568],
    [0.435, 0.556],
    [0.431, 0.546],
    [0.434, 0.536],
    [0.445, 0.532],
    [0.456, 0.535],
    [0.467, 0.53],
    [0.478, 0.532],
    [0.489, 0.528],
    [0.5, 0.526],
    [0.498, 0.536],
    [0.501, 0.546],
    [0.499, 0.556],
    [0.503, 0.567],
    [0.506, 0.578],
    [0.502, 0.588],
    [0.496, 0.596],
    [0.492, 0.604],
    [0.489, 0.612],
    [0.485, 0.62],
    [0.482, 0.628],
    [0.476, 0.618],
    [0.472, 0.608],
    [0.468, 0.598],
    [0.464, 0.588],
    [0.458, 0.58],
    [0.45, 0.574],
    [0.444, 0.572],
    [0.438, 0.578],
    [0.434, 0.584],
  ],
  VEN: [
    [0.5, 0.526],
    [0.51, 0.524],
    [0.52, 0.526],
    [0.53, 0.525],
    [0.54, 0.527],
    [0.548, 0.528],
    [0.556, 0.534],
    [0.564, 0.542],
    [0.57, 0.552],
    [0.574, 0.562],
    [0.568, 0.568],
    [0.56, 0.562],
    [0.552, 0.556],
    [0.546, 0.564],
    [0.54, 0.558],
    [0.536, 0.552],
    [0.532, 0.556],
    [0.528, 0.56],
    [0.524, 0.566],
    [0.526, 0.572],
    [0.523, 0.578],
    [0.524, 0.584],
    [0.52, 0.583],
    [0.516, 0.582],
    [0.511, 0.58],
    [0.506, 0.578],
    [0.503, 0.567],
    [0.499, 0.556],
    [0.501, 0.546],
    [0.498, 0.536],
  ],
  PAP: [
    [0.482, 0.628],
    [0.485, 0.62],
    [0.489, 0.612],
    [0.492, 0.604],
    [0.496, 0.596],
    [0.502, 0.588],
    [0.506, 0.578],
    [0.511, 0.58],
    [0.516, 0.582],
    [0.52, 0.583],
    [0.524, 0.584],
    [0.532, 0.594],
    [0.54, 0.604],
    [0.548, 0.614],
    [0.552, 0.626],
    [0.558, 0.638],
    [0.566, 0.65],
    [0.58, 0.652],
    [0.576, 0.662],
    [0.588, 0.672],
    [0.598, 0.682],
    [0.608, 0.694],
    [0.604, 0.708],
    [0.592, 0.702],
    [0.58, 0.692],
    [0.574, 0.706],
    [0.578, 0.72],
    [0.57, 0.734],
    [0.568, 0.748],
    [0.558, 0.744],
    [0.562, 0.73],
    [0.558, 0.716],
    [0.55, 0.702],
    [0.542, 0.692],
    [0.536, 0.68],
    [0.526, 0.672],
    [0.516, 0.662],
    [0.506, 0.654],
    [0.496, 0.646],
    [0.488, 0.638],
  ],
  NOR: [
    [0.468, 0.264],
    [0.462, 0.254],
    [0.452, 0.266],
    [0.44, 0.276],
    [0.426, 0.282],
    [0.412, 0.274],
    [0.402, 0.26],
    [0.398, 0.244],
    [0.394, 0.228],
    [0.392, 0.212],
    [0.396, 0.196],
    [0.406, 0.182],
    [0.418, 0.17],
    [0.432, 0.16],
    [0.442, 0.146],
    [0.452, 0.13],
    [0.462, 0.114],
    [0.456, 0.1],
    [0.472, 0.088],
    [0.488, 0.074],
    [0.506, 0.06],
    [0.524, 0.048],
    [0.542, 0.042],
    [0.56, 0.046],
    [0.572, 0.056],
    [0.56, 0.066],
    [0.548, 0.078],
    [0.536, 0.09],
    [0.524, 0.104],
    [0.514, 0.12],
    [0.506, 0.136],
    [0.498, 0.152],
    [0.492, 0.168],
    [0.486, 0.184],
    [0.48, 0.2],
    [0.476, 0.216],
    [0.47, 0.232],
    [0.472, 0.248],
  ],
  SWE: [
    [0.468, 0.264],
    [0.472, 0.248],
    [0.47, 0.232],
    [0.476, 0.216],
    [0.48, 0.2],
    [0.486, 0.184],
    [0.492, 0.168],
    [0.498, 0.152],
    [0.506, 0.136],
    [0.514, 0.12],
    [0.524, 0.104],
    [0.536, 0.09],
    [0.548, 0.078],
    [0.56, 0.066],
    [0.572, 0.056],
    [0.578, 0.072],
    [0.582, 0.09],
    [0.572, 0.106],
    [0.566, 0.122],
    [0.558, 0.138],
    [0.548, 0.154],
    [0.542, 0.17],
    [0.54, 0.186],
    [0.538, 0.202],
    [0.548, 0.214],
    [0.552, 0.228],
    [0.542, 0.242],
    [0.538, 0.258],
    [0.534, 0.274],
    [0.528, 0.29],
    [0.514, 0.296],
    [0.5, 0.302],
    [0.49, 0.294],
    [0.484, 0.284],
    [0.476, 0.274],
  ],
  POL: [
    [0.554, 0.344],
    [0.568, 0.338],
    [0.582, 0.332],
    [0.596, 0.326],
    [0.602, 0.334],
    [0.616, 0.33],
    [0.628, 0.324],
    [0.64, 0.318],
    [0.654, 0.312],
    [0.66, 0.326],
    [0.666, 0.34],
    [0.662, 0.356],
    [0.668, 0.372],
    [0.674, 0.388],
    [0.67, 0.404],
    [0.678, 0.42],
    [0.684, 0.436],
    [0.68, 0.454],
    [0.687, 0.471],
    [0.692, 0.488],
    [0.678, 0.492],
    [0.662, 0.49],
    [0.646, 0.494],
    [0.63, 0.492],
    [0.614, 0.496],
    [0.598, 0.492],
    [0.586, 0.49],
    [0.576, 0.488],
    [0.573, 0.473],
    [0.568, 0.458],
    [0.572, 0.442],
    [0.566, 0.428],
    [0.56, 0.414],
    [0.564, 0.4],
    [0.56, 0.386],
    [0.555, 0.372],
    [0.558, 0.358],
  ],
  RUS: [
    [0.654, 0.312],
    [0.65, 0.298],
    [0.656, 0.284],
    [0.668, 0.292],
    [0.664, 0.276],
    [0.66, 0.262],
    [0.68, 0.258],
    [0.702, 0.252],
    [0.692, 0.236],
    [0.704, 0.218],
    [0.716, 0.198],
    [0.728, 0.178],
    [0.742, 0.158],
    [0.76, 0.146],
    [0.778, 0.13],
    [0.798, 0.118],
    [0.822, 0.112],
    [0.85, 0.108],
    [0.88, 0.114],
    [0.908, 0.128],
    [0.93, 0.15],
    [0.946, 0.178],
    [0.954, 0.21],
    [0.958, 0.244],
    [0.952, 0.278],
    [0.942, 0.312],
    [0.928, 0.344],
    [0.908, 0.372],
    [0.886, 0.398],
    [0.864, 0.412],
    [0.844, 0.424],
    [0.852, 0.44],
    [0.836, 0.456],
    [0.818, 0.448],
    [0.824, 0.434],
    [0.802, 0.438],
    [0.78, 0.45],
    [0.76, 0.464],
    [0.738, 0.474],
    [0.716, 0.482],
    [0.692, 0.488],
    [0.687, 0.471],
    [0.68, 0.454],
    [0.684, 0.436],
    [0.678, 0.42],
    [0.67, 0.404],
    [0.674, 0.388],
    [0.668, 0.372],
    [0.662, 0.356],
    [0.666, 0.34],
    [0.66, 0.326],
  ],
  BYZ: [
    [0.64, 0.596],
    [0.656, 0.586],
    [0.676, 0.58],
    [0.698, 0.574],
    [0.72, 0.568],
    [0.726, 0.582],
    [0.722, 0.598],
    [0.732, 0.612],
    [0.75, 0.61],
    [0.77, 0.602],
    [0.792, 0.596],
    [0.814, 0.604],
    [0.836, 0.608],
    [0.854, 0.618],
    [0.858, 0.636],
    [0.85, 0.656],
    [0.838, 0.674],
    [0.822, 0.69],
    [0.804, 0.698],
    [0.786, 0.706],
    [0.768, 0.696],
    [0.752, 0.706],
    [0.734, 0.698],
    [0.722, 0.684],
    [0.716, 0.668],
    [0.71, 0.652],
    [0.714, 0.636],
    [0.708, 0.622],
    [0.72, 0.618],
    [0.702, 0.614],
    [0.688, 0.616],
    [0.676, 0.624],
    [0.664, 0.62],
    [0.668, 0.636],
    [0.676, 0.652],
    [0.68, 0.668],
    [0.668, 0.672],
    [0.674, 0.684],
    [0.668, 0.7],
    [0.656, 0.706],
    [0.644, 0.7],
    [0.646, 0.684],
    [0.642, 0.668],
    [0.636, 0.654],
    [0.632, 0.638],
    [0.634, 0.622],
    [0.636, 0.608],
  ],
};

function resizeCanvas() {
  const container = document.querySelector(".map-container");
  canvasWidth = container.clientWidth;
  canvasHeight = container.clientHeight;
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  renderMap();
}

function project(x, y) {
  return [x * canvasWidth, y * canvasHeight];
}

function renderMap() {
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);

  // Draw ocean background
  ctx.fillStyle = "#1a4d6e";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // Draw each kingdom
  kingdoms.forEach((kingdom) => {
    const poly = kingdomPolygons[kingdom.code];
    if (!poly) return;

    ctx.beginPath();
    const [startX, startY] = project(poly[0][0], poly[0][1]);
    ctx.moveTo(startX, startY);

    for (let i = 1; i < poly.length; i++) {
      const [x, y] = project(poly[i][0], poly[i][1]);
      ctx.lineTo(x, y);
    }
    ctx.closePath();

    // Fill with kingdom color
    ctx.fillStyle = kingdom.color;
    ctx.fill();

    // Calculate polygon side count
    const sideCount = kingdomPolygons[kingdom.code]
      ? kingdomPolygons[kingdom.code].length
      : 0;

    // Calculate border style weight based on side count
    // 25 sides = default (weight 1), 75 sides = bolder (weight 3+)
    const isIsland = Boolean(kingdom.isIsland || kingdom.is_island);
    let borderWeight = 1;
    if (isIsland) {
      borderWeight = 4; // Island countries get thicker gold borders
    } else if (sideCount > 50) {
      borderWeight = 3; // Large countries get bolder borders
    } else if (sideCount > 25) {
      borderWeight = 2; // Medium countries get medium borders
    } else {
      borderWeight = 1; // Small countries get default borders
    }

    // Get border color based on side count and island status
    let borderColor;
    if (isIsland) {
      borderColor = "#FFD700"; // Gold for islands
    } else if (kingdom.owner_id) {
      borderColor = "#fff"; // White for owned kingdoms
    } else {
      // Base color fades with more sides
      const alpha = Math.max(0.1, 0.3 - (sideCount - 25) / 100);
      borderColor = `rgba(255,255,255,${alpha})`;
    }

    ctx.strokeStyle = borderColor;
    ctx.lineWidth = borderWeight;
    ctx.stroke();

    // Draw kingdom code label
    const [labelX, labelY] = getCentroid(poly);
    ctx.fillStyle = "#000";
    ctx.font = "bold 14px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(
      kingdom.code,
      project(labelX, labelY)[0],
      project(labelX, labelY)[1],
    );

    // Draw troop dots: central troops at centroid, border troops along edges
    renderTroopDots(ctx, kingdom, poly);
  });
}

function getCentroid(poly) {
  let x = 0,
    y = 0;
  poly.forEach(([px, py]) => {
    x += px;
    y += py;
  });
  return [x / poly.length, y / poly.length];
}

// renderTroopDots draws white dot markers for troop presence:
//   - Central troops: dots clustered at the polygon centroid
//   - Border troops: dots spaced along each N/S/E/W border side
function renderTroopDots(ctx, kingdom, poly) {
  const t = troops[kingdom.id];
  if (!t) return;

  const central = t.central || 0;
  const borders = t.borders || { N: 0, S: 0, E: 0, W: 0 };

  // ---- Central troops: dots at centroid ----
  if (central > 0) {
    const [cx, cy] = project(getCentroid(poly)[0], getCentroid(poly)[1]);
    // Dot count scales with troop count (1 dot per ~10 troops, min 1, max 20)
    const dotCount = Math.min(Math.max(Math.ceil(central / 10), 1), 20);
    const spread = Math.min(central / 50, 12); // spread radius grows with troop count
    ctx.fillStyle = "#ffffff";
    for (let i = 0; i < dotCount; i++) {
      const angle = (i / dotCount) * Math.PI * 2;
      const r = spread * Math.sqrt(Math.random());
      const dx = cx + Math.cos(angle) * r;
      const dy = cy + Math.sin(angle) * r;
      ctx.beginPath();
      ctx.arc(dx, dy, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ---- Border troops: dots along each border side ----
  const sides = ["N", "S", "E", "W"];
  sides.forEach((side) => {
    const count = borders[side] || 0;
    if (!count) return;

    // Get the two endpoints of this side of the polygon
    // We approximate by finding the extreme points in each cardinal direction
    let p1, p2;
    if (side === "N") {
      p1 = poly.reduce((a, b) => (b[1] < a[1] ? b : a), poly[0]); // topmost
      p2 = poly[poly.length - 1];
    } else if (side === "S") {
      p1 = poly.reduce((a, b) => (b[1] > a[1] ? b : a), poly[0]); // bottommost
      p2 = poly[poly.length - 1];
    } else if (side === "E") {
      p1 = poly.reduce((a, b) => (b[0] > a[0] ? b : a), poly[0]); // rightmost
      p2 = poly[0];
    } else {
      // W
      p1 = poly.reduce((a, b) => (b[0] < a[0] ? b : a), poly[0]); // leftmost
      p2 = poly[poly.length - 1];
    }

    const [x1, y1] = project(p1[0], p1[1]);
    const [x2, y2] = project(p2[0], p2[1]);

    // Dot count scales: 1 dot per ~5 troops, max 15 per side
    const dotCount = Math.min(Math.max(Math.ceil(count / 5), 1), 15);
    ctx.fillStyle = "#ffffff";
    for (let i = 0; i < dotCount; i++) {
      const t = (i + 0.5) / dotCount;
      const jitter = (Math.random() - 0.5) * 4;
      const dx = x1 + (x2 - x1) * t + jitter;
      const dy = y1 + (y2 - y1) * t + jitter;
      ctx.beginPath();
      ctx.arc(dx, dy, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

function getKingdomAtPosition(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const x = (clientX - rect.left) / canvasWidth;
  const y = (clientY - rect.top) / canvasHeight;

  for (const kingdom of kingdoms) {
    const poly = kingdomPolygons[kingdom.code];
    if (!poly) continue;
    if (pointInPolygon(x, y, poly)) {
      return kingdom;
    }
  }
  return null;
}

function pointInPolygon(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

// Auth functions
function setAuthMessage(text, type) {
  const el = document.getElementById("auth-message");
  if (!el) return;
  el.textContent = text || "";
  el.classList.remove("error", "success");
  if (text) el.classList.add(type === "success" ? "success" : "error");
}

function clearAuthMessage() {
  setAuthMessage("");
}

// readErrorMessage prefers the backend's JSON error payload and falls back
// to plain-text bodies produced by http.Error.
async function readErrorMessage(res, fallback) {
  let body = "";
  try {
    body = (await res.text()).trim();
  } catch (_) {
    // body unreadable; fall through to the fallback message
  }
  if (body) {
    try {
      const data = JSON.parse(body);
      if (data && (data.error || data.message))
        return data.error || data.message;
    } catch (_) {
      return body; // not JSON: plain-text error message
    }
  }
  return fallback;
}

function showRegister(e) {
  if (e) e.preventDefault();
  clearAuthMessage();
  document.getElementById("login-form").classList.add("hidden");
  document.getElementById("register-form").classList.remove("hidden");
}

function showLogin(e) {
  if (e) e.preventDefault();
  clearAuthMessage();
  document.getElementById("register-form").classList.add("hidden");
  document.getElementById("login-form").classList.remove("hidden");
}

async function register() {
  if (authBusy) return;
  clearAuthMessage();

  const username = document.getElementById("register-username").value.trim();
  const email = document.getElementById("register-email").value.trim();
  const password = document.getElementById("register-password").value;

  if (!username || !email || !password) {
    setAuthMessage("Username, email, and password are required.");
    return;
  }

  const btn = document.querySelector("#register-form button");
  authBusy = true;
  if (btn) btn.disabled = true;
  try {
    const res = await fetch(`${API_URL}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, email, password }),
    });

    if (!res.ok) {
      throw new Error(
        await readErrorMessage(res, "Registration failed. Please try again."),
      );
    }

    // Success: reset the register form, switch to login with the username
    // prefilled, and show a visible confirmation on the auth screen.
    document.getElementById("register-username").value = "";
    document.getElementById("register-email").value = "";
    document.getElementById("register-password").value = "";
    showLogin();
    document.getElementById("login-username").value = username;
    document.getElementById("login-password").value = "";
    setAuthMessage("Registration successful! You can now log in.", "success");
    document.getElementById("login-password").focus();
  } catch (err) {
    setAuthMessage(err.message || "Registration failed. Please try again.");
  } finally {
    authBusy = false;
    if (btn) btn.disabled = false;
  }
}

async function login() {
  if (authBusy) return;
  clearAuthMessage();

  const username = document.getElementById("login-username").value.trim();
  const password = document.getElementById("login-password").value;

  if (!username || !password) {
    setAuthMessage("Username and password are required.");
    return;
  }

  const btn = document.querySelector("#login-form button");
  authBusy = true;
  if (btn) btn.disabled = true;
  try {
    const res = await fetch(`${API_URL}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    if (!res.ok) {
      throw new Error(
        await readErrorMessage(res, "Invalid username or password"),
      );
    }

    const data = await res.json();
    token = data.token;
    currentUser = { id: data.user_id, username: data.username };

    localStorage.setItem("token", token);
    localStorage.setItem("user", JSON.stringify(currentUser));

    // Clear any stale message so it is gone when the auth screen is
    // shown again after logout, then drop the password from the DOM.
    clearAuthMessage();
    document.getElementById("login-password").value = "";
    showGameScreen();
  } catch (err) {
    setAuthMessage(err.message || "Invalid username or password");
    document.getElementById("login-password").select();
  } finally {
    authBusy = false;
    if (btn) btn.disabled = false;
  }
}

function logout() {
  loggedOut = true;
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  fetch(`${API_URL}/logout`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => {});

  token = null;
  currentUser = null;
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  clearAuthMessage();

  if (ws) {
    ws.onclose = null; // suppress auto-reconnect
    ws.close();
    ws = null;
  }

  document.getElementById("auth-screen").classList.add("active");
  document.getElementById("game-screen").classList.remove("active");
  closeModal();
}

function showGameScreen() {
  closeModal();
  document.getElementById("auth-screen").classList.remove("active");
  document.getElementById("game-screen").classList.add("active");
  document.getElementById("player-name").textContent = currentUser.username;
  resizeCanvas();
  startClock();
  connectWebSocket();
  loadKingdoms();
  checkMyKingdom();
}

async function loadKingdoms() {
  try {
    const res = await fetch(`${API_URL}/countries?era=medieval`);
    kingdoms = await res.json();
    // Build border lookup map: country code -> set of common land border country codes
    // Countries bordered by water are independent of other sea borders
    kingdomBorders = {};
    kingdoms.forEach((k) => {
      let parsedBorders = k.borders;
      if (typeof parsedBorders === "string") {
        try {
          parsedBorders = JSON.parse(parsedBorders);
        } catch {
          parsedBorders = null;
        }
      }
      kingdomBorders[k.code] = new Set(parsedBorders?.borders || []);
      k.isIsland = Boolean(k.isIsland || k.is_island);
    });
    renderMap();
    renderKingdomList();
    // Load troop data for the player's kingdom
    await loadAllTroops();
  } catch (err) {
    logMessage("Error loading kingdoms: " + err.message);
  }
}

// loadAllTroops fetches troop state for the player's kingdom.
async function loadAllTroops() {
  if (!myKingdom || !myKingdom.country_id) return;
  try {
    const res = await fetch(`${API_URL}/troops`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (data && data.country_id === myKingdom.country_id) {
      troops[data.country_id] = {
        central: data.central || 0,
        borders: data.borders || { N: 0, S: 0, E: 0, W: 0 },
      };
    }
  } catch (err) {
    console.error("Error loading troops:", err);
  }
}

async function checkMyKingdom() {
  try {
    const res = await fetch(`${API_URL}/my-country`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (data.has_country) {
      myKingdom = data;
      document.getElementById("player-kingdom").textContent = data.country_name;
      document.getElementById("country-selection").classList.add("hidden");
      document.getElementById("my-kingdom").classList.remove("hidden");
      document.getElementById("my-kingdom-name").textContent =
        data.country_name;
      document.getElementById("my-kingdom-active").textContent = new Date(
        data.last_active,
      ).toLocaleString();
    } else {
      // No kingdom (or one we no longer hold): collapse back to the
      // claim panel so the UI never offers actions the server rejects.
      myKingdom = null;
      document.getElementById("player-kingdom").textContent = "No Kingdom";
      document.getElementById("country-selection").classList.remove("hidden");
      document.getElementById("my-kingdom").classList.add("hidden");
      closeModal(); // dismiss any open action modal; actions are unavailable without a kingdom
    }
  } catch (err) {
    console.error("Error checking kingdom:", err);
  }
}

function renderKingdomList() {
  const list = document.getElementById("available-kingdoms");
  list.innerHTML = "";
  const available = kingdoms.filter((k) => !k.owner_id);
  available.forEach((kingdom) => {
    const div = document.createElement("div");
    div.className = "kingdom-item";
    div.dataset.kingdomId = kingdom.id;
    div.innerHTML = `<div class="kingdom-color" style="background: ${kingdom.color}"></div><span>${kingdom.name}</span>`;
    div.onclick = () => selectKingdom(kingdom.id, div);
    list.appendChild(div);
  });
  // Re-apply the selection highlight if a broadcast-triggered re-render
  // wiped it while the player's choice is still pending.
  if (selectedKingdomId) {
    const selected = list.querySelector(
      `.kingdom-item[data-kingdom-id="${selectedKingdomId}"]`,
    );
    if (selected) selected.classList.add("selected");
  }
}

function selectKingdom(id, listItem) {
  selectedKingdomId = id;
  document
    .querySelectorAll(".kingdom-item")
    .forEach((el) => el.classList.remove("selected"));
  if (listItem) listItem.classList.add("selected");
  document.getElementById("claim-btn").disabled = false;
}

async function claimKingdom() {
  if (!selectedKingdomId) {
    showToast("Select a kingdom first", "error");
    return;
  }
  try {
    const res = await fetch(
      `${API_URL}/assign-country?country_id=${selectedKingdomId}`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    if (!res.ok)
      throw new Error(await readErrorMessage(res, "Could not claim kingdom"));
    logMessage("Kingdom claimed successfully!");
    showToast("Kingdom claimed!", "success");
    checkMyKingdom();
    loadKingdoms();
  } catch (err) {
    const msg = err.message || "Could not claim kingdom";
    logMessage("Error claiming kingdom: " + msg);
    showToast(msg, "error");
  }
}

function connectWebSocket() {
  loggedOut = false;
  ws = new WebSocket(WS_URL);
  ws.onopen = () => {
    document
      .getElementById("connection-status")
      .classList.remove("disconnected");
    logMessage("Connected to game server");
    sendHeartbeat();
    if (!heartbeatTimer) heartbeatTimer = setInterval(sendHeartbeat, 30000);
  };
  ws.onclose = () => {
    document.getElementById("connection-status").classList.add("disconnected");
    if (loggedOut) return; // do not reconnect after logout
    logMessage("Disconnected from server");
    setTimeout(connectWebSocket, 5000);
  };
  ws.onmessage = (event) => {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return; // ignore malformed frames
    }
    // init envelope: {type: 'init', state: GameState}; broadcasts are raw GameState
    const state = msg && msg.type === "init" ? msg.state : msg;
    if (!state || !Array.isArray(state.countries)) return;
    lastStateAt = Date.now();
    currentTick = state.tick || 0;
    const rulers = Array.isArray(state.players) ? state.players.length : 0;
    document.getElementById("tick-display").textContent =
      `Turn ${currentTick} · ${rulers} ruler${rulers === 1 ? "" : "s"}`;
    kingdoms = state.countries;
    renderMap();
    renderKingdomList();
    refreshMyKingdomStats();
    if (myKingdom && myKingdom.country_id) {
      updateEconomyPanel(kingdoms.find((k) => k.id === myKingdom.country_id));
      refreshKingdomCommandCenter();
    }
    if (Array.isArray(state.actions) && state.actions.length) {
      // Only surface an action when it is genuinely new; every 90s tick
      // and every other player's action re-broadcasts the same list.
      const latest = state.actions[0];
      const actionKey = JSON.stringify(latest);
      if (actionKey !== lastLoggedActionKey) {
        lastLoggedActionKey = actionKey;
        logMessage(`${latest.action_type}: ${latest.description}`);
      }
    }
  };
}

// refreshMyKingdomStats syncs the sidebar numbers from the broadcast state.
function refreshMyKingdomStats() {
  if (!myKingdom || !myKingdom.country_id) return;
  const country = kingdoms.find((k) => k.id === myKingdom.country_id);
  if (!country) return;
  const popEl = document.getElementById("my-kingdom-pop");
  const resEl = document.getElementById("my-kingdom-res");
  if (popEl) popEl.textContent = country.population.toLocaleString();
  if (resEl) resEl.textContent = country.resources.toLocaleString();
}

// ---- Economy dashboard ----
// lastEconomy holds the previous broadcast's indicators so trend arrows can
// show the direction of change between state updates.
let lastEconomy = null;

// updateEconomyPanel renders the country's derived economy block (carried on
// every state broadcast) into the sidebar treasury panel.
function updateEconomyPanel(country) {
  const panel = document.getElementById("economy-panel");
  if (!panel) return;
  if (!country || !country.economy) {
    panel.classList.add("hidden");
    return;
  }
  panel.classList.remove("hidden");
  const e = country.economy;
  const set = (id, v) => {
    const el = document.getElementById(id);
    if (el) el.textContent = v;
  };
  set("econ-currency", Number(e.currency_value).toFixed(2));
  set("econ-gdp", e.gdp.toLocaleString());
  set("econ-revenue", e.tax_revenue.toLocaleString());
  set("econ-military", e.military_expenditure.toLocaleString());
  const bal = document.getElementById("econ-balance");
  if (bal) {
    bal.textContent =
      (e.budget_balance >= 0 ? "+" : "") + e.budget_balance.toLocaleString();
    bal.classList.toggle("econ-positive", e.budget_balance >= 0);
    bal.classList.toggle("econ-negative", e.budget_balance < 0);
  }
  set("econ-reserve", e.gold_reserve.toLocaleString());
  set("econ-rate", e.tax_rate);
  set(
    "econ-levels",
    `Markets ${e.markets} · Infrastructure ${e.infrastructure}`,
  );

  if (lastEconomy) {
    setTrend(
      "econ-currency-trend",
      e.currency_value,
      lastEconomy.currency_value,
    );
    setTrend("econ-gdp-trend", e.gdp, lastEconomy.gdp);
    setTrend(
      "econ-balance-trend",
      e.budget_balance,
      lastEconomy.budget_balance,
    );
  }
  lastEconomy = e;
}

// setTrend paints an up/down arrow when an indicator moved between broadcasts.
function setTrend(id, now, prev) {
  const el = document.getElementById(id);
  if (!el) return;
  if (now > prev) {
    el.textContent = "▲";
    el.className = "econ-trend econ-positive";
  } else if (now < prev) {
    el.textContent = "▼";
    el.className = "econ-trend econ-negative";
  } else {
    el.textContent = "";
    el.className = "econ-trend";
  }
}

function sendHeartbeat() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    fetch(`${API_URL}/heartbeat`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {});
  }
}

function logMessage(msg) {
  const log = document.getElementById("log-entries");
  const entry = document.createElement("div");
  entry.className = "log-entry";
  entry.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  log.insertBefore(entry, log.firstChild);
  while (log.children.length > 50) log.removeChild(log.lastChild);
}

canvas.addEventListener("click", (e) => {
  const kingdom = getKingdomAtPosition(e.clientX, e.clientY);
  if (kingdom) {
    // If clicking your own country, open the command center view.
    if (myKingdom && kingdom.id === myKingdom.country_id) {
      openKingdomCommandCenter(kingdom);
      return;
    }
    const info = document.getElementById("kingdom-info");
    document.getElementById("kingdom-name").textContent = kingdom.name;
    document.getElementById("kingdom-population").textContent =
      kingdom.population.toLocaleString();
    document.getElementById("kingdom-resources").textContent =
      kingdom.resources.toLocaleString();
    const ownerLabel = kingdom.owner_name
      ? "Owner: " + kingdom.owner_name
      : kingdom.owner_id
        ? "Owned"
        : "Unclaimed";
    document.getElementById("kingdom-owner").textContent = ownerLabel;
    info.classList.remove("hidden");
    shownKingdomId = kingdom.id;
    // Selecting an unclaimed kingdom on the map arms the Claim button,
    // matching what clicking it in the sidebar list does.
    if (!kingdom.owner_id) {
      const listItem = document.querySelector(
        `.kingdom-item[data-kingdom-id="${kingdom.id}"]`,
      );
      selectKingdom(kingdom.id, listItem);
    }
  }
});

const ACTION_SETS = {
  diplomacy: {
    title: "Diplomacy Actions",
    options: ["Send Envoy", "Propose Alliance", "Declare War", "Request Trade"],
  },
  economy: {
    title: "Economic Actions",
    options: [
      "Collect Taxes",
      "Build Market",
      "Trade Resources",
      "Invest in Infrastructure",
    ],
  },
  military: {
    title: "Military Actions",
    options: ["Recruit Troops", "Move Army", "Fortify Borders", "Scout Enemy"],
  },
};

// ACTION_META defines, per action label, which auxiliary fields the frontend
// must collect and whether the backend requires a target state.
//   targetRequired: action needs target_country_id (another country, not own)
//   interiorSupported: action supports direction+speed (interior movement)
//   requiresMovementChoice: action lets user pick interior vs target (Move Army)
const ACTION_META = {
  // Diplomacy — all require a target country.
  "Send Envoy": {
    targetRequired: true,
    interiorSupported: false,
    requiresMovementChoice: false,
  },
  "Propose Alliance": {
    targetRequired: true,
    interiorSupported: false,
    requiresMovementChoice: false,
  },
  "Declare War": {
    targetRequired: true,
    interiorSupported: false,
    requiresMovementChoice: false,
  },
  "Request Trade": {
    targetRequired: true,
    interiorSupported: false,
    requiresMovementChoice: false,
  },

  // Economy — only Trade Resources requires a target.
  "Collect Taxes": {
    targetRequired: false,
    interiorSupported: false,
    requiresMovementChoice: false,
  },
  "Build Market": {
    targetRequired: false,
    interiorSupported: false,
    requiresMovementChoice: false,
  },
  "Trade Resources": {
    targetRequired: true,
    interiorSupported: false,
    requiresMovementChoice: false,
  },
  "Invest in Infrastructure": {
    targetRequired: false,
    interiorSupported: false,
    requiresMovementChoice: false,
  },

  // Military — mixed.
  "Recruit Troops": {
    targetRequired: false,
    interiorSupported: false,
    requiresMovementChoice: false,
  },
  "Move Army": {
    targetRequired: false,
    interiorSupported: true,
    requiresMovementChoice: true,
  },
  "Fortify Borders": {
    targetRequired: false,
    interiorSupported: true,
    requiresMovementChoice: false,
  },
  "Scout Enemy": {
    targetRequired: true,
    interiorSupported: false,
    requiresMovementChoice: false,
  },
};

// showToast displays a transient notification above all overlays so action
// results are always visible regardless of modal state or sidebar scroll.
function showToast(message, type) {
  const container = document.getElementById("toast-container");
  if (!container) return;
  const toast = document.createElement("div");
  toast.className = "toast " + (type === "error" ? "error" : "success");
  toast.textContent = message;
  container.appendChild(toast);
  while (container.children.length > 3) container.firstChild.remove();
  setTimeout(() => {
    toast.classList.add("fade-out");
    setTimeout(() => toast.remove(), 400);
  }, 3600);
}

function showAction(type) {
  // Close command center if open
  document.getElementById("kingdom-command-center").classList.add("hidden");

  // Actions require a server-confirmed kingdom; never open the modal for
  // an unconfirmed client state.
  // Actions require a server-confirmed kingdom.
  if (!myKingdom) {
    showToast("Claim a kingdom first", "error");
    return;
  }
  const modal = document.getElementById("action-modal");
  const title = document.getElementById("action-title");
  const options = document.getElementById("action-options");
  const feedback = document.getElementById("action-feedback");
  const action = ACTION_SETS[type];
  title.textContent = action.title;
  if (feedback) {
    feedback.textContent = "";
    feedback.classList.add("hidden");
  }

  // Populate the target country dropdown with all kingdoms except the
  // player's own (you cannot target your own country).
  const targetSelect = document.getElementById("action-target-country");
  if (targetSelect) {
    targetSelect.innerHTML = '<option value="">-- Select a country --</option>';
    kingdoms.forEach((k) => {
      if (myKingdom && k.id === myKingdom.country_id) return; // skip own kingdom
      const opt = document.createElement("option");
      opt.value = k.id;
      opt.textContent = k.name;
      targetSelect.appendChild(opt);
    });
  }

  // Build option buttons. Each button stores its action label so that
  // clicking re-evaluates which auxiliary fields to show.
  options.innerHTML = action.options
    .map(
      (opt) =>
        `<button class="action-option" style="display:block;width:100%;text-align:left;margin:4px 0" ` +
        `onclick='onActionOption("${type}", ${JSON.stringify(opt)})'>${opt}</button>`,
    )
    .join("");

  // Show auxiliary fields for the first (default) option.
  onActionOption(type, action.options[0]);

  modal.classList.remove("hidden");
  const bayMap = {
    economy: "fiscal",
    military: "military",
    diplomacy: "diplomacy",
  };
  const kingdom =
    kingdoms.find((k) => k.id === myKingdom.country_id) || myKingdom;
  openKingdomCommandCenter(kingdom, bayMap[type] || "all");
}

// onActionOption is called when the user picks a specific action label
// within a category. It shows/hides auxiliary fields based on that action's
// metadata (target country, movement type, direction, speed).
function onActionOption(type, label) {
  const meta = ACTION_META[label] || {
    targetRequired: false,
    interiorSupported: false,
    requiresMovementChoice: false,
  };

  const targetField = document.getElementById("action-field-target");
  const movementField = document.getElementById("action-field-movement");
  const directionField = document.getElementById("action-field-direction");
  const speedField = document.getElementById("action-field-speed");
  const feedback = document.getElementById("action-feedback");
  if (feedback) {
    feedback.textContent = "";
    feedback.classList.add("hidden");
  }

  // Target country field: show only if the action requires a target state.
  if (targetField) {
    if (meta.targetRequired) targetField.classList.remove("hidden");
    else targetField.classList.add("hidden");
  }

  // Movement type field: show only if the action lets the user pick
  // interior vs target movement (currently only "Move Army").
  if (movementField) {
    if (meta.requiresMovementChoice) movementField.classList.remove("hidden");
    else movementField.classList.add("hidden");
  }

  // Direction field: show for interior movement actions.
  if (directionField) {
    if (meta.interiorSupported && !meta.requiresMovementChoice) {
      directionField.classList.remove("hidden");
    } else if (meta.requiresMovementChoice) {
      // For Move Army: show direction only if Interior is selected.
      const interiorRadio = document.querySelector(
        'input[name="action-movement-type"][value="interior"]',
      );
      if (interiorRadio && interiorRadio.checked) {
        directionField.classList.remove("hidden");
      } else {
        directionField.classList.add("hidden");
      }
    } else {
      directionField.classList.add("hidden");
    }
  }

  // Speed field: same visibility logic as direction.
  if (speedField) {
    if (meta.interiorSupported && !meta.requiresMovementChoice) {
      speedField.classList.remove("hidden");
    } else if (meta.requiresMovementChoice) {
      const interiorRadio = document.querySelector(
        'input[name="action-movement-type"][value="interior"]',
      );
      if (interiorRadio && interiorRadio.checked) {
        speedField.classList.remove("hidden");
      } else {
        speedField.classList.add("hidden");
      }
    } else {
      speedField.classList.add("hidden");
    }
  }

  // When movement type changes (Move Army), toggle direction/speed visibility.
  const radios = document.querySelectorAll(
    'input[name="action-movement-type"]',
  );
  radios.forEach((radio) => {
    radio.onchange = () => {
      if (directionField) {
        directionField.classList.toggle("hidden", radio.value !== "interior");
      }
      if (speedField) {
        speedField.classList.toggle("hidden", radio.value !== "interior");
      }
    };
  });
}

// performAction sends a real-time action to the server; the engine then
// broadcasts the new world state to every connected client (including us).
// Failures keep the modal open and surface the server message inside it;
// successes close the modal and confirm with a toast.
async function performAction(type, description) {
  // Actions require a server-confirmed kingdom. Reject outright if the
  // client does not currently own one — actions on unowned territories
  // must be unavailable, not merely rejected by the server.
  if (!myKingdom) {
    showToast("You must own a kingdom to perform actions", "error");
    closeModal();
    return;
  }
  const options = document.getElementById("action-options");
  const feedback = document.getElementById("action-feedback");
  if (actionBusy) return;
  actionBusy = true;
  const buttons = options.querySelectorAll("button");
  buttons.forEach((b) => {
    b.disabled = true;
  });
  try {
    // Build the payload, adding auxiliary fields based on the action's
    // metadata (target country, movement type, direction, speed).
    const payload = { action_type: type, description };
    const meta = ACTION_META[description] || {};

    if (meta.targetRequired) {
      const targetSelect = document.getElementById("action-target-country");
      const targetId = targetSelect ? parseInt(targetSelect.value, 10) : NaN;
      if (!targetId || Number.isNaN(targetId)) {
        throw new Error("Target country is required for this action.");
      }
      if (myKingdom && targetId === myKingdom.country_id) {
        throw new Error("Cannot target your own country.");
      }
      payload.target_country_id = targetId;
    }

    if (meta.requiresMovementChoice) {
      const movementType = document.querySelector(
        'input[name="action-movement-type"]:checked',
      );
      if (movementType) {
        payload.movement_type = movementType.value;
      }
      if (movementType && movementType.value === "interior") {
        const directionSelect = document.getElementById("action-direction");
        const speedSelect = document.getElementById("action-speed");
        if (!directionSelect || !directionSelect.value) {
          throw new Error("Direction is required for interior movement.");
        }
        if (!speedSelect || !speedSelect.value) {
          throw new Error("Speed is required for interior movement.");
        }
        payload.direction = directionSelect.value;
        payload.speed = speedSelect.value;
      }
    } else if (meta.interiorSupported) {
      // Fortify Borders: direction is required, no movement choice.
      const directionSelect = document.getElementById("action-direction");
      const speedSelect = document.getElementById("action-speed");
      if (!directionSelect || !directionSelect.value) {
        throw new Error("Border side (direction) is required for this action.");
      }
      payload.direction = directionSelect.value;
      if (speedSelect && speedSelect.value) {
        payload.speed = speedSelect.value;
      }
    }

    const res = await fetch(`${API_URL}/action`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await readErrorMessage(res, "Action failed"));
    const data = await res.json();
    logMessage(`Action sent: ${description}`);
    applyActionResult(data);
    closeModal();
    showToast(`Action complete: ${description}`, "success");
  } catch (err) {
    const msg = err.message || "Action failed";
    logMessage(`Action failed: ${msg}`);
    if (msg.indexOf("no country assigned") !== -1) {
      // The server disagrees with our client state: resync so the UI
      // collapses back to the claim panel instead of staying wrong.
      checkMyKingdom();
    }
    if (feedback) {
      feedback.textContent = msg;
      feedback.classList.remove("hidden");
    }
  } finally {
    actionBusy = false;
    buttons.forEach((b) => {
      b.disabled = false;
    });
  }
}

// applyActionResult merges the server's post-action kingdom snapshot into the
// live UI so resources/population/tick update immediately (AJAX-style)
// without a page refresh or waiting for the WebSocket broadcast.
function applyActionResult(data) {
  if (!data) return;
  if (typeof data.tick === "number" && data.tick > 0) {
    currentTick = data.tick;
    const tickEl = document.getElementById("tick-display");
    const match = tickEl ? tickEl.textContent.match(/\d+ ruler/) : null;
    const rulerCount = match ? match[0].replace(/\D/g, "") : 0;
    if (tickEl)
      tickEl.textContent = `Turn ${data.tick} · ${rulerCount} ruler${rulerCount === 1 ? "" : "s"}`;
  }
  if (!data.country_id) return;
  const kingdom = kingdoms.find((k) => k.id === data.country_id);
  if (kingdom) {
    if (typeof data.population === "number")
      kingdom.population = data.population;
    if (typeof data.resources === "number") kingdom.resources = data.resources;
    if (typeof data.country_name === "string") kingdom.name = data.country_name;
  } else {
    kingdoms.push({
      id: data.country_id,
      name: data.country_name || "Kingdom",
      population: typeof data.population === "number" ? data.population : 0,
      resources: typeof data.resources === "number" ? data.resources : 0,
    });
  }
  if (myKingdom && myKingdom.country_id === data.country_id) {
    if (typeof data.population === "number")
      myKingdom.population = data.population;
    if (typeof data.resources === "number")
      myKingdom.resources = data.resources;
    refreshKingdomCommandCenter();
  }
  // Merge troop data if present in the action result
  if (data.troops) {
    troops[data.country_id] = data.troops;
  }
  renderMap();
  renderKingdomList();
  refreshMyKingdomStats();
  // Keep the info popup honest if it is showing this kingdom.
  const info = document.getElementById("kingdom-info");
  if (
    info &&
    !info.classList.contains("hidden") &&
    shownKingdomId === data.country_id
  ) {
    document.getElementById("kingdom-population").textContent = (
      typeof data.population === "number" ? data.population : 0
    ).toLocaleString();
    document.getElementById("kingdom-resources").textContent = (
      typeof data.resources === "number" ? data.resources : 0
    ).toLocaleString();
  }
}


function closeKingdomCommandCenter() {
  const cc = document.getElementById("kingdom-command-center");
  if (cc) cc.classList.add("hidden");
}

function closeModal() {
  const am = document.getElementById("action-modal");
  if (am) am.classList.add("hidden");
  closeKingdomCommandCenter();
}

// ============================================================
// WAR ROOM CONSOLE: Interactive Dials, Meters & Tactical Levers
// ============================================================

let currentConsoleBay = "all";
let taxRate = 50;
let investmentRate = 0;
let socialCostsRate = 0;
let marketsLevel = 0;
let infraLevel = 0;
let compassDirection = "N";
let compassAngle = 0;
let movementMode = "interior"; // 'interior' | 'target'
let marchSpeed = "Slow"; // 'Slow' | 'Fast'
let selectedTargetCountryId = null;
let targetCountryIndex = 0;
let diplomaticStance = "envoy"; // 'envoy' | 'alliance' | 'trade' | 'war'
let commandCenterDetail = null;
let activeDial = null;
let debouncedPushSettingsTimer = null;
let dialsWired = false;
let compassDragging = false;

const DIAL_BASE_DEG = 120;
const DIAL_DEG_PER_UNIT = 2.4; // 240 deg sweep for 0..100 range

// openKingdomCommandCenter opens the master war room console with live
// dials, meters, minimap, radar targeting, and mechanical actuators.
async function openKingdomCommandCenter(kingdom, bay = "all") {
  const modal = document.getElementById("kingdom-command-center");
  if (!modal) return;

  if (!kingdom) {
    kingdom = myKingdom ? (kingdoms.find((k) => k.id === myKingdom.country_id) || myKingdom) : null;
  }
  if (!kingdom) return;

  const kingdomNameEl = document.getElementById("cc-kingdom-name");
  if (kingdomNameEl) kingdomNameEl.textContent = kingdom.name || "My Kingdom";

  const codeEl = document.getElementById("cc-kingdom-code");
  if (codeEl) codeEl.textContent = kingdom.code || "REALM";

  const rulerEl = document.getElementById("cc-ruler-name");
  if (rulerEl) {
    rulerEl.textContent = currentUser ? `Lord ${currentUser.username}` : "Sovereign";
  }

  const crestEl = document.getElementById("cc-realm-crest");
  if (crestEl && kingdom.color) {
    crestEl.style.filter = `drop-shadow(0 0 10px ${kingdom.color})`;
  }

  // Fetch consolidated kingdom detail (troops, economy settings, development)
  let detail = null;
  try {
    const res = await fetch(`${API_URL}/kingdom-detail`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      detail = await res.json();
      commandCenterDetail = detail;
    }
  } catch (err) {
    console.error("Error fetching kingdom detail:", err);
  }

  // Fetch diplomatic relations
  let relations = [];
  try {
    const res = await fetch(`${API_URL}/diplomacy`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      relations = await res.json();
    }
  } catch (err) {
    console.error("Error fetching diplomacy:", err);
  }

  // Bind values from server detail or fallbacks
  const pop = detail?.population ?? kingdom.population ?? 1000;
  const resAmt = detail?.resources ?? kingdom.resources ?? 500;
  const central = detail?.central_troops ?? troops[kingdom.id]?.central ?? 0;
  const borders = detail?.border_troops ?? troops[kingdom.id]?.borders ?? { N: 0, S: 0, E: 0, W: 0 };

  taxRate = typeof detail?.economy_rate === "number" ? detail.economy_rate : 50;
  investmentRate = typeof detail?.investment === "number" ? detail.investment : 0;
  socialCostsRate = typeof detail?.social_costs === "number" ? detail.social_costs : 0;
  marketsLevel = typeof detail?.markets === "number" ? detail.markets : 0;
  infraLevel = typeof detail?.infrastructure === "number" ? detail.infrastructure : 0;

  // Initialize and render all meters
  renderMeters();
  setMeter("cc-meter-population", pop, 5000);
  setMeter("cc-meter-resources", resAmt, 3000);
  setMeter("cc-meter-troops", central, 200);

  const popVal = document.getElementById("cc-meter-pop-val");
  if (popVal) popVal.textContent = pop.toLocaleString();
  const resVal = document.getElementById("cc-meter-res-val");
  if (resVal) resVal.textContent = resAmt.toLocaleString();
  const troopVal = document.getElementById("cc-meter-troop-val");
  if (troopVal) troopVal.textContent = central.toLocaleString();

  // Military Tier Label (levy 1-99, company 100-499, battalion 500-999, legion 1000-4999, horde 5000+)
  const tierBadge = document.getElementById("cc-army-tier");
  if (tierBadge) {
    let tier = "LEVY";
    if (central >= 5000) tier = "HORDE";
    else if (central >= 1000) tier = "LEGION";
    else if (central >= 500) tier = "BATTALION";
    else if (central >= 100) tier = "COMPANY";
    tierBadge.textContent = tier;
  }

  // Update Stepper Cards (Markets & Infrastructure)
  updateStepperDisplay();

  // Initialize & Wire Dials
  wireConsoleDials();

  setTaxRate(taxRate, false);
  setInvestmentRate(investmentRate, false);
  setSocialRate(socialCostsRate, false);
  updateEconomyHintsLive();

  // Border garrison pod counters & meters
  updateBorderGarrisonPods(borders);

  // Compass Dial & Needle
  setCompassSide(compassDirection, true);

  // Minimap with highlighted active border
  const minimap = document.getElementById("cc-minimap");
  if (minimap) {
    const ctx = minimap.getContext("2d");
    ctx.clearRect(0, 0, minimap.width, minimap.height);
    renderKingdomMinimap(ctx, kingdom, borders, central, compassDirection);
  }

  // Target Radar Selector
  updateTargetKingdomDisplay();

  // Diplomatic Stance Selector
  selectDiploStance(diplomaticStance);

  // Diplomatic Treaties Ledger
  renderDiplomacyLedger(relations);

  // Conscribe cost label
  const recruitCostLabel = document.getElementById("cc-recruit-cost-label");
  if (recruitCostLabel) {
    const cost = Math.max(1, Math.floor(pop / 100));
    recruitCostLabel.textContent = `Cost: ${cost} Gold · +10 Troops`;
  }

  // Switch to requested console bay
  switchConsoleBay(bay);

  modal.classList.remove("hidden");
}

// refreshKingdomCommandCenter updates all readouts, meters, and minimap
// live without interrupting active dial dragging.
async function refreshKingdomCommandCenter() {
  const modal = document.getElementById("kingdom-command-center");
  if (!modal || modal.classList.contains("hidden")) return;
  if (!myKingdom) return;

  try {
    const res = await fetch(`${API_URL}/kingdom-detail`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const detail = await res.json();
    commandCenterDetail = detail;

    const kingdom = kingdoms.find((k) => k.id === myKingdom.country_id) || myKingdom;
    const pop = detail.population ?? kingdom.population ?? 1000;
    const resAmt = detail.resources ?? kingdom.resources ?? 500;
    const central = detail.central_troops ?? troops[kingdom.id]?.central ?? 0;
    const borders = detail.border_troops ?? troops[kingdom.id]?.borders ?? { N: 0, S: 0, E: 0, W: 0 };
    marketsLevel = detail.markets || 0;
    infraLevel = detail.infrastructure || 0;

    renderMeters();
    setMeter("cc-meter-population", pop, 5000);
    setMeter("cc-meter-resources", resAmt, 3000);
    setMeter("cc-meter-troops", central, 200);

    const popVal = document.getElementById("cc-meter-pop-val");
    if (popVal) popVal.textContent = pop.toLocaleString();
    const resVal = document.getElementById("cc-meter-res-val");
    if (resVal) resVal.textContent = resAmt.toLocaleString();
    const troopVal = document.getElementById("cc-meter-troop-val");
    if (troopVal) troopVal.textContent = central.toLocaleString();

    const tierBadge = document.getElementById("cc-army-tier");
    if (tierBadge) {
      let tier = "LEVY";
      if (central >= 5000) tier = "HORDE";
      else if (central >= 1000) tier = "LEGION";
      else if (central >= 500) tier = "BATTALION";
      else if (central >= 100) tier = "COMPANY";
      tierBadge.textContent = tier;
    }

    if (!activeDial) {
      if (typeof detail.economy_rate === "number") setTaxRate(detail.economy_rate, false);
      if (typeof detail.investment === "number") setInvestmentRate(detail.investment, false);
      if (typeof detail.social_costs === "number") setSocialRate(detail.social_costs, false);
    }

    updateStepperDisplay();
    updateBorderGarrisonPods(borders);
    updateEconomyHintsLive();

    const minimap = document.getElementById("cc-minimap");
    if (minimap) {
      const ctx = minimap.getContext("2d");
      ctx.clearRect(0, 0, minimap.width, minimap.height);
      renderKingdomMinimap(ctx, kingdom, borders, central, compassDirection);
    }
  } catch (err) {
    console.error("Error refreshing command center:", err);
  }
}

// ============================================================
// ROTARY DIALS ENGINE: Drag, Touch, Wheel & Live Mathematical Model
// ============================================================

function dialValueFromPoint(dialEl, clientX, clientY) {
  const rect = dialEl.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const dx = clientX - cx;
  const dy = clientY - cy;
  let deg = (Math.atan2(dx, -dy) * 180) / Math.PI;
  if (deg < 0) deg += 360;
  if (deg < DIAL_BASE_DEG) return deg <= DIAL_BASE_DEG / 2 ? 100 : 0;
  const raw = (deg - DIAL_BASE_DEG) / DIAL_DEG_PER_UNIT;
  return Math.round(Math.min(100, Math.max(0, raw)));
}

function wireConsoleDials() {
  if (dialsWired) return;
  dialsWired = true;

  const dialConfigs = [
    { id: "cc-economy-dial", type: "tax", set: setTaxRate, get: () => taxRate },
    { id: "cc-investment-dial", type: "investment", set: setInvestmentRate, get: () => investmentRate },
    { id: "cc-social-dial", type: "social", set: setSocialRate, get: () => socialCostsRate },
  ];

  dialConfigs.forEach((cfg) => {
    const dial = document.getElementById(cfg.id);
    if (!dial) return;

    // Inject ticks if empty
    const ticks = dial.querySelector(".dial-ticks");
    if (ticks && !ticks.children.length) {
      ticks.style.transform = `rotate(${DIAL_BASE_DEG}deg)`;
      for (let v = 0; v <= 100; v += 10) {
        const t = document.createElement("span");
        if (v % 25 === 0) t.className = "tick-major";
        t.style.transform = `rotate(${v * DIAL_DEG_PER_UNIT}deg)`;
        ticks.appendChild(t);
      }
    }

    const arc = dial.querySelector(".dial-arc");
    if (arc) arc.style.transform = `rotate(${DIAL_BASE_DEG}deg)`;

    const onStart = (e) => {
      activeDial = cfg;
      const pt = e.touches && e.touches.length ? e.touches[0] : e;
      cfg.set(dialValueFromPoint(dial, pt.clientX, pt.clientY), false);
      e.preventDefault();
    };

    dial.addEventListener("mousedown", onStart);
    dial.addEventListener("touchstart", onStart, { passive: false });

    // Wheel support for fine tuning
    dial.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 2 : -2;
        cfg.set(cfg.get() + delta, true);
      },
      { passive: false }
    );

    // Keyboard support for accessibility
    dial.addEventListener("keydown", (e) => {
      const step = e.shiftKey ? 5 : 1;
      if (e.key === "ArrowUp" || e.key === "ArrowRight") {
        e.preventDefault();
        cfg.set(cfg.get() + step, true);
      } else if (e.key === "ArrowDown" || e.key === "ArrowLeft") {
        e.preventDefault();
        cfg.set(cfg.get() - step, true);
      }
    });
  });

  // Global move & release handlers for dials
  window.addEventListener("mousemove", (e) => {
    if (!activeDial) return;
    const dial = document.getElementById(activeDial.id);
    if (dial) {
      activeDial.set(dialValueFromPoint(dial, e.clientX, e.clientY), false);
    }
  });

  window.addEventListener(
    "touchmove",
    (e) => {
      if (!activeDial || !e.touches.length) return;
      const dial = document.getElementById(activeDial.id);
      if (dial) {
        activeDial.set(dialValueFromPoint(dial, e.touches[0].clientX, e.touches[0].clientY), false);
      }
    },
    { passive: false }
  );

  const onEnd = () => {
    if (!activeDial) return;
    activeDial = null;
    schedulePushEconomySettings();
  };
  window.addEventListener("mouseup", onEnd);
  window.addEventListener("touchend", onEnd);

  // Wire Compass Dial
  wireCompassDial();

  // Wire Target Dial
  wireTargetDial();
}

function setTaxRate(value, push = true) {
  taxRate = Math.round(Math.min(100, Math.max(0, value)));
  const dial = document.getElementById("cc-economy-dial");
  if (dial) {
    const pointer = dial.querySelector(".dial-pointer");
    if (pointer) pointer.style.transform = `rotate(${DIAL_BASE_DEG + taxRate * DIAL_DEG_PER_UNIT}deg)`;
    const arc = dial.querySelector(".dial-arc");
    if (arc) arc.style.setProperty("--dial-arc-deg", `${taxRate * DIAL_DEG_PER_UNIT}deg`);
  }
  const readout = document.getElementById("cc-economy-dial-value");
  if (readout) readout.textContent = taxRate;

  updateEconomyHintsLive();
  if (push) schedulePushEconomySettings();
}

function setInvestmentRate(value, push = true) {
  investmentRate = Math.round(Math.min(100, Math.max(0, value)));
  const dial = document.getElementById("cc-investment-dial");
  if (dial) {
    const pointer = dial.querySelector(".dial-pointer");
    if (pointer) pointer.style.transform = `rotate(${DIAL_BASE_DEG + investmentRate * DIAL_DEG_PER_UNIT}deg)`;
    const arc = dial.querySelector(".dial-arc");
    if (arc) arc.style.setProperty("--dial-arc-deg", `${investmentRate * DIAL_DEG_PER_UNIT}deg`);
  }
  const readout = document.getElementById("cc-investment-dial-value");
  if (readout) readout.textContent = investmentRate;

  updateEconomyHintsLive();
  if (push) schedulePushEconomySettings();
}

function setSocialRate(value, push = true) {
  socialCostsRate = Math.round(Math.min(100, Math.max(0, value)));
  const dial = document.getElementById("cc-social-dial");
  if (dial) {
    const pointer = dial.querySelector(".dial-pointer");
    if (pointer) pointer.style.transform = `rotate(${DIAL_BASE_DEG + socialCostsRate * DIAL_DEG_PER_UNIT}deg)`;
    const arc = dial.querySelector(".dial-arc");
    if (arc) arc.style.setProperty("--dial-arc-deg", `${socialCostsRate * DIAL_DEG_PER_UNIT}deg`);
  }
  const readout = document.getElementById("cc-social-dial-value");
  if (readout) readout.textContent = socialCostsRate;

  updateEconomyHintsLive();
  if (push) schedulePushEconomySettings();
}

function schedulePushEconomySettings() {
  if (debouncedPushSettingsTimer) clearTimeout(debouncedPushSettingsTimer);
  debouncedPushSettingsTimer = setTimeout(() => {
    pushEconomySettings();
  }, 350);
}

function pushEconomySettings() {
  if (!token || !myKingdom) return;
  fetch(`${API_URL}/set-economy-settings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      economy_rate: taxRate,
      investment: investmentRate,
      social_costs: socialCostsRate,
    }),
  })
    .then((res) => {
      if (!res.ok) throw new Error("Failed to persist economy settings");
      return res.json();
    })
    .then((data) => {
      logMessage(`Economy updated: Tax ${taxRate}%, Inv ${investmentRate}%, Social ${socialCostsRate}%`);
      if (data) {
        updateDerivedEconomyUI(data.gdp, data.currency_value, data.inflation_rate, data.budget_balance);
      }
    })
    .catch((err) => console.error("Error setting economy settings:", err));
}

// Backward-compatibility aliases
function setEconomyRate(value, push = true) {
  setTaxRate(value, push);
}

function pushEconomyRate() {
  schedulePushEconomySettings();
}

function performEconomyAction(direction) {
  setTaxRate(taxRate + (direction === "increase" ? 5 : -5));
}

function lafferJs(rate) {
  const peak = 58.0;
  const alpha = 1.35;
  const beta = 0.98;
  const r = Math.max(0, Math.min(100, rate));
  const term1 = Math.pow(r / peak, alpha);
  const term2 = Math.pow((100.0 - r) / (100.0 - peak), beta);
  return term1 * term2;
}

function updateEconomyHintsLive() {
  const kingdom = (myKingdom && kingdoms.find((k) => k.id === myKingdom.country_id)) || myKingdom || {};
  const pop = commandCenterDetail?.population ?? kingdom.population ?? 1000;
  const res = commandCenterDetail?.resources ?? kingdom.resources ?? 500;
  const tr = commandCenterDetail?.central_troops ?? 0;

  const baseProductivity = 0.08;
  const infraBonus = 1.0 + (infraLevel || 0) * 0.03;
  const mktBonus = 1.0 + (marketsLevel || 0) * 0.05;
  const invBonus = 1.0 + (investmentRate || 0) * 0.002;
  const laffer = lafferJs(taxRate);

  const gdp = pop * baseProductivity * infraBonus * mktBonus * invBonus * laffer;
  const revenue = Math.round(gdp * (taxRate / 100.0) + 0.5);
  const expenditure = Math.round(tr * 0.5 + (socialCostsRate + investmentRate) * 0.2 + 0.5);
  const balance = revenue - expenditure;

  let value = 1.0;
  if (gdp > 0) value = res / gdp / 5.0;

  let inflation = 0.0;
  if (balance < 0) inflation = -balance * 0.05;
  inflation += socialCostsRate * 0.02 + investmentRate * 0.005;
  if (inflation > 100) inflation = 100;

  // Update hints
  const taxHint = document.getElementById("cc-tax-impact-hint");
  if (taxHint) {
    if (taxRate > 62) {
      taxHint.textContent = `Rev: +${revenue}/tick (⚠️ Tax Drag)`;
      taxHint.style.color = "#ff6b6b";
    } else {
      taxHint.textContent = `Tax Revenue: +${revenue}/tick`;
      taxHint.style.color = "#4ecdc4";
    }
  }

  const invHint = document.getElementById("cc-investment-hint");
  if (invHint) {
    invHint.textContent = `+${(investmentRate * 0.2).toFixed(1)}% GDP Multiplier`;
  }

  const socHint = document.getElementById("cc-social-hint");
  if (socHint) {
    socHint.textContent = `Spend: -${Math.round(socialCostsRate * 0.2)} gold · Infl: +${(socialCostsRate * 0.02).toFixed(1)}%`;
  }

  // Population growth preview
  const popGrowthEl = document.getElementById("cc-pop-growth");
  if (popGrowthEl) {
    let growth = pop * 0.005 * (gdp / (pop * 0.02 || 1));
    growth += (investmentRate + socialCostsRate) * 0.0005;
    growth *= Math.max(0, 1.0 - pop / 1000000);
    const g = Math.max(1, Math.round(growth));
    popGrowthEl.textContent = `+${g}/tick`;
  }

  updateDerivedEconomyUI(Math.round(gdp), value, inflation, balance);
}

function updateDerivedEconomyUI(gdp, currencyVal, inflationRate, balance) {
  const gdpValEl = document.getElementById("cc-meter-gdp-val");
  if (gdpValEl && typeof gdp === "number") {
    gdpValEl.textContent = gdp.toLocaleString();
    setMeter("cc-meter-gdp", gdp, 500);
  }

  const curEl = document.getElementById("cc-currency-val");
  if (curEl && typeof currencyVal === "number") {
    curEl.textContent = `${currencyVal.toFixed(2)} gold`;
  }

  const balEl = document.getElementById("cc-budget-balance");
  if (balEl && typeof balance === "number") {
    balEl.textContent = `${balance >= 0 ? "+" : ""}${balance}/tick`;
    balEl.classList.toggle("negative", balance < 0);
  }
}

function updateStepperDisplay() {
  const mktLabel = document.getElementById("cc-market-level-label");
  if (mktLabel) mktLabel.textContent = `Tier ${marketsLevel}`;

  const mktPips = document.querySelectorAll("#cc-market-pips .pip");
  mktPips.forEach((pip, idx) => {
    pip.classList.toggle("active", idx < marketsLevel);
  });

  const infraLabel = document.getElementById("cc-infra-level-label");
  if (infraLabel) infraLabel.textContent = `Tier ${infraLevel}`;

  const infraPips = document.querySelectorAll("#cc-infra-pips .pip");
  infraPips.forEach((pip, idx) => {
    pip.classList.toggle("active", idx < infraLevel);
  });
}

// ============================================================
// COMPASS DIAL & TACTICAL MOVEMENT CONTROLS
// ============================================================

function wireCompassDial() {
  const dial = document.getElementById("cc-compass-dial");
  if (!dial || dial.dataset.wired) return;
  dial.dataset.wired = "1";

  const onStart = (e) => {
    compassDragging = true;
    updateCompassFromEvent(e);
    e.preventDefault();
  };

  dial.addEventListener("mousedown", onStart);
  dial.addEventListener("touchstart", onStart, { passive: false });

  window.addEventListener("mousemove", (e) => {
    if (!compassDragging) return;
    updateCompassFromEvent(e);
  });

  window.addEventListener(
    "touchmove",
    (e) => {
      if (!compassDragging || !e.touches.length) return;
      updateCompassFromEvent(e.touches[0]);
    },
    { passive: false }
  );

  const onEnd = () => {
    compassDragging = false;
  };
  window.addEventListener("mouseup", onEnd);
  window.addEventListener("touchend", onEnd);
}

function updateCompassFromEvent(e) {
  const dial = document.getElementById("cc-compass-dial");
  if (!dial) return;
  const rect = dial.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const dx = e.clientX - cx;
  const dy = e.clientY - cy;
  let deg = (Math.atan2(dx, -dy) * 180) / Math.PI;
  if (deg < 0) deg += 360;
  setCompassAngle(deg, true);
}

function setCompassAngle(deg, syncBorder = true) {
  compassAngle = Math.round(((deg % 360) + 360) % 360);
  const needle = document.getElementById("cc-compass-needle");
  if (needle) needle.style.transform = `rotate(${compassAngle}deg)`;

  const degEl = document.getElementById("cc-compass-deg");
  if (degEl) degEl.textContent = `${compassAngle}°`;

  let side = "N";
  if (compassAngle >= 315 || compassAngle < 45) side = "N";
  else if (compassAngle >= 45 && compassAngle < 135) side = "E";
  else if (compassAngle >= 135 && compassAngle < 225) side = "S";
  else side = "W";

  if (syncBorder && side !== compassDirection) {
    setCompassSide(side, false);
  }
}

function setCompassSide(side, updateAngle = true) {
  compassDirection = side;
  const sideNames = { N: "NORTH", S: "SOUTH", E: "EAST", W: "WEST" };
  const labelEl = document.getElementById("cc-compass-direction-label");
  if (labelEl) labelEl.textContent = sideNames[side] || side;

  document.querySelectorAll(".cardinal-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.classList.contains(`card-${side.toLowerCase()}`));
  });

  document.querySelectorAll(".border-gauge-pod").forEach((pod) => {
    pod.classList.toggle("selected-frontier", pod.classList.contains(`pod-${side.toLowerCase()}`));
  });

  const fortifyLabel = document.getElementById("cc-fortify-border-label");
  if (fortifyLabel) {
    fortifyLabel.textContent = `Reinforce ${sideNames[side]} Frontier`;
  }

  if (updateAngle) {
    const angleMap = { N: 0, E: 90, S: 180, W: 270 };
    setCompassAngle(angleMap[side] || 0, false);
  }

  const kingdom = (myKingdom && kingdoms.find((k) => k.id === myKingdom.country_id)) || myKingdom;
  if (kingdom) {
    const minimap = document.getElementById("cc-minimap");
    if (minimap) {
      const ctx = minimap.getContext("2d");
      ctx.clearRect(0, 0, minimap.width, minimap.height);
      const borders = commandCenterDetail?.border_troops || troops[kingdom.id]?.borders || { N: 0, S: 0, E: 0, W: 0 };
      const central = commandCenterDetail?.central_troops || troops[kingdom.id]?.central || 0;
      renderKingdomMinimap(ctx, kingdom, borders, central, compassDirection);
    }
  }

  updateOrderPreview();
}

function selectCompassSide(side, e) {
  if (e) e.stopPropagation();
  setCompassSide(side, true);
}

function toggleMovementMode() {
  movementMode = movementMode === "interior" ? "target" : "interior";
  const rocker = document.getElementById("cc-mode-rocker");
  if (rocker) {
    document.getElementById("rocker-pos-interior")?.classList.toggle("active", movementMode === "interior");
    document.getElementById("rocker-pos-target")?.classList.toggle("active", movementMode === "target");
  }

  const desc = document.getElementById("cc-mode-description");
  if (desc) {
    desc.textContent =
      movementMode === "interior"
        ? `Station 10 troops on selected ${compassDirection} frontier`
        : `March expeditionary force to ${getTargetCountryName()}`;
  }

  updateOrderPreview();
}

function toggleMarchSpeed() {
  marchSpeed = marchSpeed === "Slow" ? "Fast" : "Slow";
  const handle = document.getElementById("cc-throttle-handle");
  if (handle) {
    handle.classList.toggle("speed-fast", marchSpeed === "Fast");
  }

  document.getElementById("th-label-slow")?.classList.toggle("active", marchSpeed === "Slow");
  document.getElementById("th-label-fast")?.classList.toggle("active", marchSpeed === "Fast");

  updateOrderPreview();
}

function updateOrderPreview() {
  const orderEl = document.getElementById("cc-deploy-order-preview");
  if (!orderEl) return;
  const sideNames = { N: "North", S: "South", E: "East", W: "West" };
  if (movementMode === "interior") {
    orderEl.textContent = `March to ${sideNames[compassDirection]} Border (${marchSpeed})`;
  } else {
    orderEl.textContent = `Expedition to ${getTargetCountryName()} (${marchSpeed})`;
  }
}

function updateBorderGarrisonPods(borders) {
  const sides = ["N", "S", "E", "W"];
  sides.forEach((s) => {
    const count = (borders && borders[s]) || 0;
    const valEl = document.getElementById(`cc-border-${s.toLowerCase()}`);
    if (valEl) valEl.textContent = count.toLocaleString();

    const barEl = document.getElementById(`bar-fill-${s.toLowerCase()}`);
    if (barEl) {
      const pct = Math.min(100, Math.round((count / 50) * 100));
      if (barEl.parentElement && barEl.parentElement.classList.contains("vertical")) {
        barEl.style.height = `${pct}%`;
      } else {
        barEl.style.width = `${pct}%`;
      }
    }
  });
}

// ============================================================
// TARGET KINGDOM RADAR SELECTOR
// ============================================================

function getAvailableTargets() {
  return kingdoms.filter((k) => !myKingdom || k.id !== myKingdom.country_id);
}

function getTargetCountryName() {
  const targets = getAvailableTargets();
  const t = targets.find((k) => k.id === selectedTargetCountryId) || targets[0];
  return t ? t.name : "Target Realm";
}

function stepTargetKingdom(delta) {
  const targets = getAvailableTargets();
  if (!targets.length) return;
  targetCountryIndex = (targetCountryIndex + delta + targets.length) % targets.length;
  selectedTargetCountryId = targets[targetCountryIndex].id;
  updateTargetKingdomDisplay();
}

function updateTargetKingdomDisplay() {
  const targets = getAvailableTargets();
  if (!targets.length) return;
  if (targetCountryIndex >= targets.length) targetCountryIndex = 0;
  const target = targets[targetCountryIndex] || targets[0];
  if (!target) return;
  selectedTargetCountryId = target.id;

  const codeEl = document.getElementById("cc-target-code");
  if (codeEl) codeEl.textContent = target.code || "---";

  const shieldEl = document.getElementById("cc-target-color-shield");
  if (shieldEl) {
    shieldEl.style.color = target.color || "#ffd700";
    shieldEl.style.filter = `drop-shadow(0 0 8px ${target.color || "#ffd700"})`;
  }

  const nameEl = document.getElementById("cc-target-name");
  if (nameEl) nameEl.textContent = target.name || "Target Realm";

  const ownerEl = document.getElementById("cc-target-owner");
  if (ownerEl) ownerEl.textContent = target.owner_name || (target.owner_id ? "Occupied" : "Unclaimed");

  const popEl = document.getElementById("cc-target-pop");
  if (popEl) popEl.textContent = (target.population || 0).toLocaleString();

  const resEl = document.getElementById("cc-target-res");
  if (resEl) resEl.textContent = `${(target.resources || 0).toLocaleString()} gold`;

  const statusEl = document.getElementById("cc-target-status");
  if (statusEl) {
    statusEl.textContent = target.owner_name ? "Sovereign State" : "Unclaimed Territory";
  }

  updateOrderPreview();
  updateDiploPreview();
}

function wireTargetDial() {
  const dial = document.getElementById("cc-target-dial");
  if (!dial || dial.dataset.wired) return;
  dial.dataset.wired = "1";

  dial.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      stepTargetKingdom(e.deltaY < 0 ? -1 : 1);
    },
    { passive: false }
  );

  let startX = 0;
  let isDraggingTarget = false;
  let hasMoved = false;

  dial.addEventListener("mousedown", (e) => {
    isDraggingTarget = true;
    hasMoved = false;
    startX = e.clientX;
  });

  window.addEventListener("mousemove", (e) => {
    if (!isDraggingTarget) return;
    const diff = e.clientX - startX;
    if (Math.abs(diff) > 25) {
      hasMoved = true;
      stepTargetKingdom(diff > 0 ? 1 : -1);
      startX = e.clientX;
    }
  });

  window.addEventListener("mouseup", () => {
    if (isDraggingTarget && !hasMoved) {
      stepTargetKingdom(1);
    }
    isDraggingTarget = false;
  });
}

// ============================================================
// DIPLOMATIC STANCE SELECTOR
// ============================================================

function selectDiploStance(stance) {
  diplomaticStance = stance;
  const stances = ["envoy", "alliance", "trade", "war"];
  stances.forEach((s) => {
    const btn = document.querySelector(`.stance-pos-btn.pos-${s}`);
    if (btn) btn.classList.toggle("active", s === stance);
  });

  const pointer = document.getElementById("cc-stance-pointer");
  if (pointer) {
    const angles = { envoy: 0, alliance: 90, trade: 180, war: 270 };
    pointer.style.transform = `rotate(${angles[stance] || 0}deg)`;
  }

  const descEl = document.getElementById("cc-stance-description");
  if (descEl) {
    const descs = {
      envoy: "Dispatch royal envoy to initiate formal diplomatic relations and establish emissary presence.",
      alliance: "Propose mutual defense and non-aggression alliance with the targeted realm.",
      trade: "Dispatch an authorized merchant caravan to trade 50 resources with target realm.",
      war: "Formal declaration of hostilities: sound the war drums against enemy frontier.",
    };
    descEl.textContent = descs[stance] || "";
  }

  updateDiploPreview();
}

function updateDiploPreview() {
  const preview = document.getElementById("cc-diplo-mission-preview");
  if (!preview) return;
  const targetName = getTargetCountryName();
  const missions = {
    envoy: `Send Royal Envoy to ${targetName}`,
    alliance: `Propose Alliance with ${targetName}`,
    trade: `Dispatch 50 Gold Caravan to ${targetName}`,
    war: `Declare War Against ${targetName}`,
  };
  preview.textContent = missions[diplomaticStance] || `Mission to ${targetName}`;
}

function renderDiplomacyLedger(relations) {
  const list = document.getElementById("cc-diplomacy-list");
  const empty = document.getElementById("cc-diplomacy-empty");
  if (!list) return;
  list.innerHTML = "";
  if (relations && relations.length) {
    if (empty) empty.style.display = "none";
    relations.forEach((rel) => {
      const row = document.createElement("div");
      row.className = "diplomacy-row";
      let badgeClass = "rel-badge envoy";
      let badgeText = "ENVOY";
      const desc = (rel.description || "").toLowerCase();
      if (desc.includes("alliance")) {
        badgeClass = "rel-badge alliance";
        badgeText = "ALLIANCE";
      } else if (desc.includes("war") || desc.includes("declare")) {
        badgeClass = "rel-badge war";
        badgeText = "WAR";
      } else if (desc.includes("trade")) {
        badgeClass = "rel-badge trade";
        badgeText = "TRADE";
      } else if (desc.includes("envoy")) {
        badgeClass = "rel-badge envoy";
        badgeText = "ENVOY";
      }
      row.innerHTML = `
        <span class="rel-country">${escapeHtml(rel.target_name || "Unknown")}</span>
        <span class="rel-action">${escapeHtml(rel.description || "")}</span>
        <span class="rel-badge ${badgeClass}">${badgeText}</span>
      `;
      list.appendChild(row);
    });
  } else {
    if (empty) empty.style.display = "block";
  }
}

// ============================================================
// TACTICAL ACTUATORS & ACTION EXECUTION
// ============================================================

async function performActionDirect(actionType, description, extraParams = {}) {
  if (!token || !myKingdom) {
    showToast("Claim a kingdom first", "error");
    return;
  }

  const payload = {
    type: actionType,
    description: description,
    ...extraParams,
  };

  try {
    const res = await fetch(`${API_URL}/action`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      throw new Error(await readErrorMessage(res, "Action failed"));
    }

    const data = await res.json();
    logMessage(`Order executed: ${description}`);
    applyActionResult(data);
    refreshKingdomCommandCenter();
    showToast(`Order executed: ${description}`, "success");
  } catch (err) {
    const msg = err.message || "Action failed";
    logMessage(`Order failed: ${msg}`);
    showToast(msg, "error");
  }
}

function triggerCollectTaxes() {
  const lever = document.getElementById("cc-lever-collect-taxes");
  if (lever) {
    lever.classList.add("pulled");
    setTimeout(() => {
      lever.classList.remove("pulled");
    }, 350);
  }
  performActionDirect("economy", "Collect Taxes");
}

function triggerUpgradeMarket() {
  performActionDirect("economy", "Build Market");
}

function triggerUpgradeInfra() {
  performActionDirect("economy", "Invest in Infrastructure");
}

function triggerRecruitTroops() {
  const btn = document.getElementById("cc-lever-recruit");
  if (btn) {
    btn.style.transform = "scale(0.96)";
    setTimeout(() => {
      btn.style.transform = "";
    }, 180);
  }
  performActionDirect("military", "Recruit Troops");
}

function triggerFortifyBorder() {
  performActionDirect("military", "Fortify Borders", {
    direction: compassDirection,
  });
}

function triggerDispatchTroops() {
  const lever = document.getElementById("cc-lever-deploy");
  if (lever) {
    lever.style.transform = "translateY(3px)";
    setTimeout(() => {
      lever.style.transform = "";
    }, 250);
  }

  if (movementMode === "interior") {
    performActionDirect("military", "Move Army", {
      movement_type: "interior",
      direction: compassDirection,
      speed: marchSpeed,
    });
  } else {
    if (!selectedTargetCountryId) {
      showToast("Please select a target country on the radar", "error");
      return;
    }
    performActionDirect("military", "Move Army", {
      movement_type: "target",
      target_country_id: selectedTargetCountryId,
    });
  }
}

function triggerDispatchDiplomacy() {
  if (!selectedTargetCountryId) {
    showToast("Please select a target country on the radar", "error");
    return;
  }
  const lever = document.getElementById("cc-lever-dispatch-diplo");
  if (lever) {
    lever.style.transform = "translateY(3px)";
    setTimeout(() => {
      lever.style.transform = "";
    }, 250);
  }

  const actionMap = {
    envoy: { type: "diplomacy", desc: "Send Envoy" },
    alliance: { type: "diplomacy", desc: "Propose Alliance" },
    trade: { type: "economy", desc: "Trade Resources" },
    war: { type: "diplomacy", desc: "Declare War" },
  };
  const act = actionMap[diplomaticStance] || actionMap.envoy;
  performActionDirect(act.type, act.desc, {
    target_country_id: selectedTargetCountryId,
  });
}

function switchConsoleBay(bay) {
  currentConsoleBay = bay;
  document.querySelectorAll(".nav-tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.bay === bay);
  });

  const bays = {
    fiscal: document.getElementById("bay-fiscal"),
    military: document.getElementById("bay-military"),
    diplomacy: document.getElementById("bay-diplomacy"),
  };
  Object.keys(bays).forEach((b) => {
    if (!bays[b]) return;
    bays[b].style.display = bay === "all" || bay === b ? "block" : "none";
  });
}

// ============================================================
// METERS & MINIMAP ENGINE
// ============================================================

function renderMeters() {
  ["cc-meter-population", "cc-meter-resources", "cc-meter-troops", "cc-meter-gdp"].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;

    let ticks = el.querySelector(".meter-ticks");
    if (!ticks) {
      ticks = document.createElement("div");
      ticks.className = "meter-ticks";
      el.appendChild(ticks);
    }
    if (!ticks.children.length) {
      for (let v = 0; v <= 100; v += 10) {
        const t = document.createElement("span");
        if (v % 25 === 0) t.className = "tick-major";
        t.style.transform = `rotate(${v * DIAL_DEG_PER_UNIT}deg)`;
        ticks.appendChild(t);
      }
    }

    let needle = el.querySelector(".meter-needle");
    if (!needle) {
      needle = document.createElement("div");
      needle.className = "meter-needle";
      el.appendChild(needle);
    }
  });
}

function setMeter(elementId, value, max) {
  const el = document.getElementById(elementId);
  if (!el) return;
  const pct = Math.min(Math.max(value / (max || 1), 0), 1);
  const deg = Math.round(pct * 240);
  el.style.background = `conic-gradient(from 120deg, #ffd700 0deg, #ffd700 ${deg}deg, rgba(255,215,0,0.12) ${deg}deg, rgba(255,215,0,0.12) 360deg)`;
  const needle = el.querySelector(".meter-needle");
  if (needle) {
    needle.style.transform = `rotate(${DIAL_BASE_DEG + pct * 240}deg)`;
  }
}

function renderKingdomMinimap(ctx, kingdom, borders, central, activeBorder = "N") {
  const poly = kingdomPolygons[kingdom.code];
  if (!poly) return;

  const w = 240;
  const h = 180;
  const pad = 20;

  let minX = 1, minY = 1, maxX = 0, maxY = 0;
  poly.forEach(([px, py]) => {
    minX = Math.min(minX, px);
    minY = Math.min(minY, py);
    maxX = Math.max(maxX, px);
    maxY = Math.max(maxY, py);
  });
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;
  const scale = Math.min((w - 2 * pad) / rangeX, (h - 2 * pad) / rangeY);
  const offX = (w - rangeX * scale) / 2;
  const offY = (h - rangeY * scale) / 2;

  const proj = (px, py) => [offX + (px - minX) * scale, offY + (py - minY) * scale];

  // Fill territory
  ctx.beginPath();
  poly.forEach(([px, py], i) => {
    const [x, y] = proj(px, py);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.fillStyle = kingdom.color || "#4ecdc4";
  ctx.globalAlpha = 0.35;
  ctx.fill();
  ctx.globalAlpha = 1.0;

  // Base border stroke
  ctx.strokeStyle = "#ffd700";
  ctx.lineWidth = 2;
  ctx.stroke();

  // Central troop dots at centroid
  if (central && central > 0) {
    const cx = poly.reduce((s, [px]) => s + px, 0) / poly.length;
    const cy = poly.reduce((s, [, py]) => s + py, 0) / poly.length;
    const [mx, my] = proj(cx, cy);
    const dotCount = Math.min(Math.max(Math.ceil(central / 10), 1), 12);
    const spread = Math.min(central / 60, 8);
    ctx.fillStyle = "#ffffff";
    for (let i = 0; i < dotCount; i++) {
      const angle = (i / dotCount) * Math.PI * 2;
      const r = spread * Math.sqrt(Math.random());
      ctx.beginPath();
      ctx.arc(mx + Math.cos(angle) * r, my + Math.sin(angle) * r, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Border troop dots & highlight along active border
  const sides = ["N", "S", "E", "W"];
  sides.forEach((side) => {
    const count = (borders && borders[side]) || 0;
    let p1, p2;
    if (side === "N") {
      p1 = poly.reduce((a, b) => (b[1] < a[1] ? b : a), poly[0]);
      p2 = poly[poly.length - 1];
    } else if (side === "S") {
      p1 = poly.reduce((a, b) => (b[1] > a[1] ? b : a), poly[0]);
      p2 = poly[poly.length - 1];
    } else if (side === "E") {
      p1 = poly.reduce((a, b) => (b[0] > a[0] ? b : a), poly[0]);
      p2 = poly[0];
    } else {
      p1 = poly.reduce((a, b) => (b[0] < a[0] ? b : a), poly[0]);
      p2 = poly[poly.length - 1];
    }
    const [x1, y1] = proj(p1[0], p1[1]);
    const [x2, y2] = proj(p2[0], p2[1]);

    if (side === activeBorder) {
      ctx.strokeStyle = "#00f0ff";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    if (count > 0) {
      const dotCount = Math.min(Math.max(Math.ceil(count / 5), 1), 10);
      ctx.fillStyle = side === activeBorder ? "#00f0ff" : "#ffffff";
      for (let i = 0; i < dotCount; i++) {
        const t = (i + 0.5) / dotCount;
        const jitter = (Math.random() - 0.5) * 3;
        ctx.beginPath();
        ctx.arc(x1 + (x2 - x1) * t + jitter, y1 + (y2 - y1) * t + jitter, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  });
}

// ---- Header clock + tick urgency countdown ----
const TICK_INTERVAL_S = 15; // server broadcasts state every ~15s tick
let lastStateAt = Date.now();
let clockTimer = null;

function startClock() {
  if (clockTimer) return;
  tickClock();
  clockTimer = setInterval(tickClock, 1000);
}

function tickClock() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const h = document.getElementById("clock-hours");
  const m = document.getElementById("clock-mins");
  const s = document.getElementById("clock-seconds");
  if (h) h.textContent = pad(now.getHours());
  if (m) m.textContent = pad(now.getMinutes());
  if (s) s.textContent = pad(now.getSeconds());
  const sweep = document.getElementById("clock-sweep");
  if (sweep) sweep.style.transform = `rotate(${now.getSeconds() * 6}deg)`;
  const urg = document.getElementById("urgency-tick");
  if (urg) {
    const elapsed = Math.floor((Date.now() - lastStateAt) / 1000);
    const remain = Math.max(0, TICK_INTERVAL_S - (elapsed % TICK_INTERVAL_S));
    urg.textContent = `Next state update in ${remain}s`;
    urg.classList.toggle("urgent", remain <= 10);
  }
}

// escapeHtml prevents XSS when rendering diplomacy data.
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// Global window exposure for inline onclick handlers
window.login = login;
window.register = register;
window.showRegister = showRegister;
window.showLogin = showLogin;
window.logout = logout;
window.claimKingdom = claimKingdom;
window.showAction = showAction;
window.closeModal = closeModal;
window.closeKingdomCommandCenter = closeKingdomCommandCenter;
window.openKingdomCommandCenter = openKingdomCommandCenter;
window.refreshKingdomCommandCenter = refreshKingdomCommandCenter;
window.switchConsoleBay = switchConsoleBay;
window.triggerCollectTaxes = triggerCollectTaxes;
window.triggerUpgradeMarket = triggerUpgradeMarket;
window.triggerUpgradeInfra = triggerUpgradeInfra;
window.selectCompassSide = selectCompassSide;
window.toggleMovementMode = toggleMovementMode;
window.toggleMarchSpeed = toggleMarchSpeed;
window.triggerRecruitTroops = triggerRecruitTroops;
window.triggerFortifyBorder = triggerFortifyBorder;
window.triggerDispatchTroops = triggerDispatchTroops;
window.stepTargetKingdom = stepTargetKingdom;
window.selectDiploStance = selectDiploStance;
window.triggerDispatchDiplomacy = triggerDispatchDiplomacy;
window.setTaxRate = setTaxRate;
window.setInvestmentRate = setInvestmentRate;
window.setSocialRate = setSocialRate;

window.addEventListener("resize", resizeCanvas);
if (token && currentUser) showGameScreen();
