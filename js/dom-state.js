export const S = {
  mode:'edit', sceneName:null, sceneCreatedAt:null,
  listener:{x:0,y:0,angle:0}, target:null,
  sources:[], buffers:{}, selectedSource:null, keys:{},
  worldSize:25, moveSpeed:6, rotSpeed:90, dragStartAngle:0
};
let libraryData = null, libSearchQuery = '';

const $ = id => document.getElementById(id);
const app=$('app'), mainCanvas=$('mainCanvas'), ctx=mainCanvas.getContext('2d');
const minimapCanvas=$('minimapCanvas'), minimapCtx=minimapCanvas.getContext('2d');
const compassNeedle=$('compassNeedle'), hudPos=$('hudPos'), hudRot=$('hudRot'), hudSrc=$('hudSrc');
const targetIndicator=$('targetIndicator'), toastEl=$('toast');
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

export { $, app, mainCanvas, ctx, minimapCanvas, minimapCtx, compassNeedle, hudPos, hudRot, hudSrc, targetIndicator, toastEl, fileInput, fileDrop, sourcesList, selName, selAuthor, selLicense, selUrl, attrState, volSlider, volVal, heightSlider, heightVal, selDist, selAbsorb, widthSlider, widthVal, angleSlider, angleVal, stereoInd, spatialSection, routingToggle, motionModeRow, motionSpeed, motionSpeedVal, orbitRadiusEl, orbitRadiusVal, randomRangeEl, randomRangeVal, pathLoopEl, pathLoopVal, orbitParams, randomParams, pathParams, libPanel, libTree, libSearch, libCountBadge };
