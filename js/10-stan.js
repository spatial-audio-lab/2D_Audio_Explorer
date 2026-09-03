// 10-stan.js — Stan sceny (S) i uchwyty do elementow DOM.
// Stad wszystkie pozostale pliki biora `S`, `$` i nazwane uchwyty.
// Czesc Sceny rozbitej na klasyczne skrypty. Kolejnosc ladowania jest kontraktem:
// patrz lista <script> na koncu index.html.


let compassRotation = 0;
const S = {
  mode:'edit', sceneName:null, sceneCreatedAt:null,
  // sceneStart: zero wspolnego zegara sceny w czasie audioCtx. null = scena nie gra.
  sceneStart:null,
  listener:{x:0,y:0,angle:0}, target:null,
  sources:[], buffers:{}, selectedSource:null, keys:{},
  worldSize:25, moveSpeed:6, rotSpeed:90, dragStartAngle:0,
  // Czy klikniecie w plotno dokłada punkt sciezki. Na myszy robi to Shift, na telefonie
  // przycisk "Dodaj punkty" w sekcji 3.2 — obsluga w 80-ruch.js.
  dodawaniePunktow:false
};
let libraryData = null, libSearchQuery = '';

const $ = id => document.getElementById(id);
const app=$('app'), mainCanvas=$('mainCanvas'), ctx=mainCanvas.getContext('2d');
const minimapCanvas=$('minimapCanvas'), minimapCtx=minimapCanvas.getContext('2d');
const compassNeedle=$('compassNeedle'), hudPos=$('hudPos'), hudRot=$('hudRot'), hudSrc=$('hudSrc');
const targetIndicator=$('targetIndicator'), toastEl=$('toast'), toastTxtEl=$('toastTxt');
const fileInput=$('fileInput'), fileDrop=$('fileDrop');
const sourcesList=$('sourcesList'), selName=$('selName');
const selAuthor=$('selAuthor'), selLicense=$('selLicense'), selUrl=$('selUrl'), attrState=$('attrState');
const volSlider=$('volSlider'), volVal=$('volVal');
const heightSlider=$('heightSlider'), heightVal=$('heightVal'), selDist=$('selDist'), selAbsorb=$('selAbsorb');
const widthSlider=$('widthSlider'), widthVal=$('widthVal');
const angleSlider=$('angleSlider'), angleVal=$('angleVal');
const stereoInd=$('stereoInd'), spatialSection=$('spatialSection');
const routingToggle=$('routingToggle'), motionModeRow=$('motionModeRow');
const motionSpeed=$('motionSpeed'), motionSpeedVal=$('motionSpeedVal');
const orbitRadiusEl=$('orbitRadius'), orbitRadiusVal=$('orbitRadiusVal');
const randomRangeEl=$('randomRange'), randomRangeVal=$('randomRangeVal');
const pathLoopEl=$('pathLoop'), pathLoopVal=$('pathLoopVal');
const orbitParams=$('orbitParams'), randomParams=$('randomParams'), pathParams=$('pathParams');
const libPanel=$('libraryPanel'), libTree=$('libTree'), libSearch=$('libSearch'), libCountBadge=$('libCountBadge');
// Uchwyt prawego panelu stal dotad w 60-panel.js, czyli PO plikach, ktore go dzis
// potrzebuja (20-ui.js otwiera i zamyka szuflade na telefonie). Kolejnosc ladowania
// jest kontraktem: plik korzysta z tego, co zadeklarowaly pliki przed nim.
const sidebar=$('sidebar');

