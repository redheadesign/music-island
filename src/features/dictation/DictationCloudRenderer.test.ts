// @vitest-environment happy-dom
import { expect, it, vi } from 'vitest'
import { DictationCloudRenderer, type CloudFrame } from './DictationCloudRenderer'
import { defaultDictationAppearance } from '../../shared/lib/dictationAppearance'

const completionStatus = 0x91b1
const linkStatus = 0x8b82

function setup(parallel = false) {
  const methods = ['createVertexArray','createTexture','createFramebuffer','createShader','createProgram',
    'bindTexture','texParameteri','texImage2D','bindFramebuffer','framebufferTexture2D','shaderSource',
    'compileShader','attachShader','linkProgram','deleteShader','useProgram','bindVertexArray',
    'getUniformLocation','activeTexture','uniform1i','uniform1f','uniform2fv','uniform3fv','uniform4fv',
    'drawArrays','viewport','clearColor','clear','enable','blendFunc','disable','deleteFramebuffer',
    'deleteTexture','deleteProgram','deleteVertexArray'] as const
  let linked = false
  const gl = {
    ...Object.fromEntries(methods.map(name => [name,vi.fn(() => ({}))])),
    getShaderParameter: vi.fn(() => true),
    getExtension: vi.fn(() => parallel ? { COMPLETION_STATUS_KHR: completionStatus } : null),
    getProgramParameter: vi.fn((_program, status) => status !== completionStatus || linked),
    LINK_STATUS: linkStatus,
    FRAMEBUFFER_COMPLETE: 1, checkFramebufferStatus: vi.fn(() => 1),
  } as unknown as WebGL2RenderingContext
  const canvas = document.createElement('canvas')
  const context = vi.spyOn(canvas, 'getContext').mockReturnValue(gl)
  const renderer = new DictationCloudRenderer(canvas)
  const frame: CloudFrame = { time: 0, delta: .1, level: .5, phase: 'recording',
    appearance: { ...defaultDictationAppearance, theme: 'pixels' }, instant: true,
    coreWidth: 84, coreHeight: 44, coreX: 46, coreY: 25, controls: 0, singleControl: true, accent: [1,.4,0] }
  return { gl, context, renderer, frame, markLinked: () => { linked = true } }
}

it('compiles only the programs used by fox and reuses them when changing phases and themes', () => {
  const { gl, context, renderer, frame, markLinked } = setup(true)
  markLinked()
  try {
    expect(gl.createProgram).not.toHaveBeenCalled()
    renderer.render(frame)
    expect(gl.createProgram).toHaveBeenCalledTimes(3)
    renderer.render({ ...frame, phase: 'transcribing' })
    expect(gl.createProgram).toHaveBeenCalledTimes(3)
    const wave = { ...frame, appearance: { ...frame.appearance, theme: 'wave' as const } }
    renderer.render(wave)
    expect(gl.createProgram).toHaveBeenCalledTimes(5)
    renderer.render({ ...wave, phase: 'transcribing' })
    expect(gl.createProgram).toHaveBeenCalledTimes(5)
    renderer.render(frame)
    expect(gl.createProgram).toHaveBeenCalledTimes(5)
  } finally { renderer.dispose(); context.mockRestore() }
  expect(gl.deleteProgram).toHaveBeenCalledTimes(5)
})

it('splits synchronous links across frames when the driver lacks the extension', () => {
  const { gl, context, renderer, frame } = setup()
  try {
    expect(renderer.render(frame)).toBe(false)
    expect(gl.createProgram).toHaveBeenCalledTimes(1)
    expect(renderer.render(frame)).toBe(false)
    expect(gl.createProgram).toHaveBeenCalledTimes(2)
    expect(renderer.render(frame)).toBe(true)
    expect(gl.createProgram).toHaveBeenCalledTimes(3)
  } finally { renderer.dispose(); context.mockRestore() }
})

it('keeps the fallback responsive until pending shaders can be validated without blocking', () => {
  const { gl, context, renderer, frame, markLinked } = setup(true)
  try {
    expect(renderer.render(frame)).toBe(false)
    expect(gl.createProgram).toHaveBeenCalledTimes(3)
    expect(gl.getShaderParameter).not.toHaveBeenCalled()
    expect(gl.getProgramParameter).not.toHaveBeenCalledWith(expect.anything(), linkStatus)
    expect(gl.drawArrays).not.toHaveBeenCalled()

    markLinked()
    expect(renderer.render(frame)).toBe(true)
    expect(gl.getProgramParameter).toHaveBeenCalledWith(expect.anything(), linkStatus)
    expect(gl.drawArrays).toHaveBeenCalledTimes(3)
    expect(gl.createProgram).toHaveBeenCalledTimes(3)
  } finally { renderer.dispose(); context.mockRestore() }
})
