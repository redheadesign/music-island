// @vitest-environment happy-dom
import { expect, it, vi } from 'vitest'
import { DictationCloudRenderer, type CloudFrame } from './DictationCloudRenderer'
import { defaultDictationAppearance } from '../../shared/lib/dictationAppearance'

it('compiles only the programs used by fox and reuses them when changing phases and themes', () => {
  const methods = ['createVertexArray','createTexture','createFramebuffer','createShader','createProgram',
    'bindTexture','texParameteri','texImage2D','bindFramebuffer','framebufferTexture2D','shaderSource',
    'compileShader','attachShader','linkProgram','deleteShader','useProgram','bindVertexArray',
    'getUniformLocation','activeTexture','uniform1i','uniform1f','uniform2fv','uniform3fv','uniform4fv',
    'drawArrays','viewport','clearColor','clear','enable','blendFunc','disable','deleteFramebuffer',
    'deleteTexture','deleteProgram','deleteVertexArray'] as const
  const gl = {
    ...Object.fromEntries(methods.map(name => [name,vi.fn(() => ({}))])),
    getShaderParameter: vi.fn(() => true), getProgramParameter: vi.fn(() => true),
    FRAMEBUFFER_COMPLETE: 1, checkFramebufferStatus: vi.fn(() => 1),
  } as unknown as WebGL2RenderingContext
  const canvas = document.createElement('canvas')
  const context = vi.spyOn(canvas, 'getContext').mockReturnValue(gl)
  const renderer = new DictationCloudRenderer(canvas)
  const frame: CloudFrame = { time: 0, delta: .1, level: .5, phase: 'recording',
    appearance: { ...defaultDictationAppearance, theme: 'pixels' }, instant: true,
    coreWidth: 84, coreHeight: 44, coreX: 46, coreY: 25, controls: 0, singleControl: true, accent: [1,.4,0] }
  try {
    expect(gl.createProgram).not.toHaveBeenCalled()
    renderer.render(frame)
    expect(gl.createProgram).toHaveBeenCalledTimes(3)
    renderer.render({ ...frame, phase: 'transcribing' })
    expect(gl.createProgram).toHaveBeenCalledTimes(3)
    const wave = { ...frame, appearance: { ...frame.appearance, theme: 'wave' as const } }
    renderer.render(wave)
    expect(gl.createProgram).toHaveBeenCalledTimes(4)
    renderer.render({ ...wave, phase: 'transcribing' })
    expect(gl.createProgram).toHaveBeenCalledTimes(5)
    renderer.render(frame)
    expect(gl.createProgram).toHaveBeenCalledTimes(5)
  } finally { renderer.dispose(); context.mockRestore() }
  expect(gl.deleteProgram).toHaveBeenCalledTimes(5)
})
