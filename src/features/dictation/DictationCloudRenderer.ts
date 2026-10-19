import vertex from './shaders/cloudVertex.glsl?raw'
import wave from './shaders/cloudWave.glsl?raw'
import dots from './shaders/cloudDots.glsl?raw'
import background from './shaders/cloudBackground.glsl?raw'
import composite from './shaders/cloudComposite.glsl?raw'
import glass from './shaders/cloudGlass.glsl?raw'
import { dictationArtworkDefaults, type DictationAppearance } from '../../shared/lib/dictationAppearance'
import { DictationSpring } from './dictationSpring'
import { getCloudPixelRatio } from './cloudGeometry'

type Uniform = number | number[]
type Program = { value: WebGLProgram; locations: Map<string, WebGLUniformLocation | null> }
type Target = { texture: WebGLTexture; framebuffer: WebGLFramebuffer; width: number; height: number }
export type CloudFrame = {
  time: number; delta: number; level: number; phase: string; appearance: DictationAppearance; instant: boolean
  coreWidth: number; coreHeight: number; coreX: number; coreY: number; controls: number; singleControl: boolean; accent: number[]
}
const palettes: Record<DictationAppearance['palette'], number[][]> = {
  accent: [], prism: [[.369,.416,.824],[.55,.522,.957],[.698,.718,.925]],
  aurora: [[.12,.68,.72],[.24,.84,.83],[.66,.95,.91]],
  lagoon: [[.20,.47,.94],[.30,.68,.98],[.65,.83,1]],
  sakura: [[.84,.35,.59],[.95,.55,.72],[1,.78,.86]],
  ember: [[.86,.57,.22],[.98,.74,.38],[1,.88,.66]],
  dune: [[.67,.54,.38],[.84,.71,.53],[.95,.87,.7]],
  white: [[1,1,1],[1,1,1],[1,1,1]],
}
const waveDefaults = {
  uWhiteClip: 1, uUnresolvedScale: .14, uAmplitude: .22, uFreq: 1.1,
  uAberrationFreq: 1, uWaveSpeed: -1, uWaveScale: .9, uAberration: 2.6,
  uThickness: 3, uIntensity: 2, uFalloff: 1.7, uEdgeMask: .4, uEdgeMaskInset: 0,
  uBandFill: 12000, uBandFillThickness: .08, uSoftness: 2.5,
  uLowAmplitude: 20, uLowIntensity: .9, uMidAberration: .8,
  uMidAberrationAmplitude: .085, uMidBandFill: 0, uMidSoftness: .4,
  uHighAberration: .5, uHighAberrationAmplitude: .075,
}

/** The source recorder's wave, diffuse material, refraction and bevel passes.
 * Native commands and window ownership remain in the existing app adapter. */
export class DictationCloudRenderer {
  private canvas: HTMLCanvasElement
  private gl: WebGL2RenderingContext
  private programs = new Map<number, Program>()
  private targets: Target[] = []
  private vao: WebGLVertexArrayObject | null
  private empty: WebGLTexture
  private wave = new DictationSpring(0, .314)
  private dots = new DictationSpring(0, .314)
  private error = new DictationSpring(0, .32)
  private completion = 0
  private completionFrom = 0
  private completionTarget = 0
  private completionElapsed = 0
  private dotTime = 0
  private wavePhase = 0
  private colors: number[][] | null = null
  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    const gl = canvas.getContext('webgl2', { alpha: true, antialias: false, depth: false, stencil: false, premultipliedAlpha: true })
    if (!gl) throw new Error('WebGL2 unavailable')
    this.gl = gl
    this.vao = gl.createVertexArray()
    this.empty = this.texture()
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([3,4,8,255]))
  }
  private program(source: string): Program {
    const gl = this.gl
    const compile = (type: number, text: string) => {
      const shader = gl.createShader(type)
      if (!shader) throw new Error('Shader unavailable')
      gl.shaderSource(shader, text); gl.compileShader(shader)
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const reason = gl.getShaderInfoLog(shader); gl.deleteShader(shader); throw new Error(reason ?? 'Shader compilation failed')
      }
      return shader
    }
    const vs = compile(gl.VERTEX_SHADER, vertex), fs = compile(gl.FRAGMENT_SHADER, source)
    const value = gl.createProgram()
    if (!value) { gl.deleteShader(vs); gl.deleteShader(fs); throw new Error('Program unavailable') }
    gl.attachShader(value,vs); gl.attachShader(value,fs); gl.linkProgram(value)
    gl.deleteShader(vs); gl.deleteShader(fs)
    if (!gl.getProgramParameter(value,gl.LINK_STATUS)) {
      const reason = gl.getProgramInfoLog(value); gl.deleteProgram(value); throw new Error(reason ?? 'Shader linking failed')
    }
    return {value,locations:new Map()}
  }
  private texture() {
    const gl = this.gl, value = gl.createTexture()
    if (!value) throw new Error('Texture unavailable')
    gl.bindTexture(gl.TEXTURE_2D,value)
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE)
    return value
  }
  private target(index: number, width: number, height: number) {
    const gl = this.gl, previous = this.targets[index]
    if (previous?.width === width && previous.height === height) return previous
    if (previous) { gl.deleteFramebuffer(previous.framebuffer); gl.deleteTexture(previous.texture) }
    const texture = this.texture(), framebuffer = gl.createFramebuffer()
    if (!framebuffer) { gl.deleteTexture(texture); throw new Error('Framebuffer unavailable') }
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,width,height,0,gl.RGBA,gl.UNSIGNED_BYTE,null)
    gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer)
    gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0)
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      gl.deleteFramebuffer(framebuffer); gl.deleteTexture(texture); throw new Error('Incomplete framebuffer')
    }
    return this.targets[index] = {texture,framebuffer,width,height}
  }
  private draw(index: number, uniforms: Record<string, Uniform>, textures: [string,WebGLTexture][] = []) {
    const gl = this.gl
    if (!this.programs.has(index)) {
      // Fox uses only the material passes. Compile wave/particle programs only
      // when that artwork is actually drawn, then reuse them across recordings.
      this.programs.set(index,this.program([wave,dots,background,composite,glass][index]))
    }
    const program = this.programs.get(index)!
    gl.useProgram(program.value); gl.bindVertexArray(this.vao)
    const location = (name: string) => {
      if (!program.locations.has(name)) program.locations.set(name,gl.getUniformLocation(program.value,name))
      return program.locations.get(name) ?? null
    }
    textures.forEach(([name,texture],unit) => {
      gl.activeTexture(gl.TEXTURE0+unit); gl.bindTexture(gl.TEXTURE_2D,texture); gl.uniform1i(location(name),unit)
    })
    for (const [name,value] of Object.entries(uniforms)) {
      const at = location(name)
      if (at === null) continue
      if (typeof value === 'number') gl.uniform1f(at,value)
      else if (value.length === 2) gl.uniform2fv(at,value)
      else if (value.length === 3) gl.uniform3fv(at,value)
      else gl.uniform4fv(at,value)
    }
    gl.drawArrays(gl.TRIANGLES,0,3)
  }
  render(frame: CloudFrame) {
    const gl = this.gl, {appearance:a,level,time,phase} = frame
    const dpr = getCloudPixelRatio({ width: this.canvas.clientWidth, height: this.canvas.clientHeight,
      bounds: this.canvas.getBoundingClientRect(), devicePixelRatio: window.devicePixelRatio,
    })
    const width = Math.max(1,Math.round(this.canvas.clientWidth*dpr)), height = Math.max(1,Math.round(this.canvas.clientHeight*dpr))
    if (this.canvas.width !== width || this.canvas.height !== height) { this.canvas.width=width; this.canvas.height=height }
    const coreWidth=frame.coreWidth*dpr, coreHeight=frame.coreHeight*dpr, coreX=frame.coreX*dpr, coreY=frame.coreY*dpr
    const { waveBrightness, lightIntensity } = dictationArtworkDefaults
    const ew=Math.max(1,Math.round(coreWidth*1.18)), eh=Math.max(1,Math.round(44*dpr*1.18))
    const effect=this.target(0,ew,eh), scene=this.target(1,width,height)
    const working=['preparing','transcribing','processing'].includes(phase)
    const result=['completed','error','cancelled'].includes(phase)
    const waveTarget=Number(a.theme === 'wave' && !working && !result)
    const dotsTarget=Number(a.theme === 'wave' && (working || result))
    const waveOpacity=this.wave.step(waveTarget,frame.delta,frame.instant)
    const dotsOpacity=this.dots.step(dotsTarget,frame.delta,frame.instant)
    const error=this.error.step(Number(result && phase !== 'completed'),frame.delta,frame.instant)
    if (this.completionTarget !== Number(result)) {
      this.completionFrom=this.completion; this.completionTarget=Number(result); this.completionElapsed=0
    }
    this.completionElapsed+=frame.delta
    const t=Math.min(1,this.completionElapsed/(result?.32:.28)), eased=t*t*t*(t*(t*6-15)+10)
    this.completion=frame.instant?Number(result):this.completionFrom+(this.completionTarget-this.completionFrom)*eased
    const landing=Math.max(0,Math.min(1,(this.completion-.78)/.22))
    this.dotTime+=frame.delta*(1-landing*landing*(3-2*landing))
    this.wavePhase=(this.wavePhase+(-2.5-12*Math.min(1,level*.4))*frame.delta) % 62.831848
    const targetColors = a.palette === 'accent' ? [frame.accent,frame.accent.map(v=>.35+.65*v),frame.accent.map(v=>.6+.4*v)] : palettes[a.palette]
    const colorResponse=frame.instant || !this.colors ? 1 : 1-Math.exp(-frame.delta/.12)
    const previousColors=this.colors ?? targetColors
    const colors = this.colors = previousColors.map((color,i)=>color.map((value,j)=>value+(targetColors[i][j]-value)*colorResponse))
    const material = {
      uCanvasSize:[width,height], uResolution:[width,height], uTextureSize:[1,1], uBackgroundReady:0,
      uMaterialOrigin:[coreX-coreWidth/2-14*dpr,coreY-coreHeight/2-14*dpr],
      uMaterialSize:[coreWidth+28*dpr,coreHeight+28*dpr],
      uFaceOrigin:[coreX-coreWidth/2,coreY-coreHeight/2], uFaceSize:[coreWidth,coreHeight],
      uFaceShade:coreHeight>48*dpr?0:.9, uNeutralBackground:0, uThemeTint:colors[0],
      uLightIntensity:lightIntensity/100, uWaveVisibility:waveBrightness/25,
      uCompletionTint:this.completion, uError:error,
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER,effect.framebuffer); gl.viewport(0,0,ew,eh)
    gl.clearColor(0,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT)
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA)
    const base={uResolution:[ew,eh],uTime:time,uMouse:[ew/2,eh/2,0,0],uAnchor:[.5,.5]}
    const ink: Record<string,Uniform> = {}
    colors.forEach((color,i)=>{ink['uWaveColor'+i]=color;ink['uWaveHighlightColor'+i]=color.map(v=>.76+.24*v)})
    if (waveOpacity > .001) this.draw(0,{...base,...waveDefaults,...ink,uResolved:1,uLayerOpacity:waveOpacity*.98,uEffectScale:1,
      uWavePhase:this.wavePhase,uLow:level,uMid:level*.75,uHigh:level*.45,uBrightnessLow:level,
      uWaveCount:3,uAudioBrightnessResponse:1,uChromatic:Number(a.chromatic),uWaveBrightness:waveBrightness/25})
    const progress: Record<string,Uniform> = {}
    for(let i=0;i<6;i++) progress['uProgress'+i]=.5+.5*Math.sin(this.dotTime*2.5-i*.52)
    if (dotsOpacity > .001) this.draw(1,{...base,...progress,uTime:this.dotTime,uDotsResolved:1,uEffectScale:2/3,uRotation:1.4,uRingRadius:.45,
      uDotRadius:.1,uPairOffset:.085,uPairSmoothness:.2,uSmoothness:.2,uScaleDuration:2,
      uScaleStagger:.167,uScaleMin:.001,uScaleMax:.65,uGlowIntensity:.04,uFalloffPower:.7,
      uGlowFadeStart:0,uGlowFadeEnd:.7,uDotsAberration:-.05,uCenterCore:.5,uDotsScale:1,
      uAppear:dotsOpacity,uGather:0,uCharge:0,uFlash:0,uParticleTint:colors[0],uParticleNeutral:Number(a.chromatic),
      uSuccess:this.completion,uError:error,uCopied:0})
    gl.disable(gl.BLEND)
    gl.bindFramebuffer(gl.FRAMEBUFFER,scene.framebuffer);gl.viewport(0,0,width,height)
    this.draw(2,material,[['uBackground',this.empty]])
    gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA)
    this.draw(3,{uResolution:[width,height],uCanvasSize:[width,height],
      uEffectOrigin:[coreX-ew/2,height-(25*dpr)-eh/2],uEffectSize:[ew,eh],
      uContainer:.9,uContainerBlack:.25,uContainerFade:1,uContainerGauss:8,uContainerTint:[.36,.04,.05],uAnger:0},
      [['uEffectTexture',effect.texture]])
    gl.disable(gl.BLEND)
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,width,height)
    const controlRadius=16*dpr*frame.controls
    this.draw(4,{...material,uPanelOrigin:[coreX-coreWidth/2-10*dpr,coreY-coreHeight/2-10*dpr],
      uPanelSize:[coreWidth+20*dpr,coreHeight+20*dpr],uMarginPx:10*dpr,uCornerRadius:22*dpr,
      uHeight:18*dpr*.7,uCurvature:1,uRefractAmount:-32*dpr*.7,uAngle:0,uGradRadialMix:.08,
      uKeyAngle:Math.PI*.25,uFillAngle:Math.PI*1.25,uHlHeight:2.2*dpr*.7,uHlCut:.52,uHlNorm:8,
      uHlAmount:.72,uHlCurv:1,uTransparentOutside:1,uLobe0:[0,0,0,0],uLobe1:[0,0,0,0],
      uLobe2:[0,0,0,0],uLobeProgress:[0,0,0],uControl0:frame.singleControl?[0,0,0,0]:[20*dpr,height-25*dpr,controlRadius,controlRadius],
      uControl1:[width-20*dpr,height-25*dpr,controlRadius,controlRadius],uControlProgress:frame.controls,
      uMergeRadius:8*dpr,uPixelScale:dpr,uRimStrength:.30,uRimWidth:3.2*dpr,uRimTime:time,
      uVoiceImpact:level,uVoicePhase:this.wavePhase,uTranslationActive:0},
      [['uSceneTexture',scene.texture],['uBackground',this.empty]])
  }
  dispose() {
    const gl=this.gl
    this.targets.forEach(t=>{gl.deleteFramebuffer(t.framebuffer);gl.deleteTexture(t.texture)})
    this.programs.forEach(p=>gl.deleteProgram(p.value))
    gl.deleteTexture(this.empty);gl.deleteVertexArray(this.vao)
  }
}

