#version 300 es
precision highp float;

uniform vec2 u_resolution;
uniform float u_time;
uniform float u_bass;
uniform vec3 u_primary;
uniform vec3 u_secondary;
out vec4 fragColor;

// A travelling fold with a broad, soft body and a narrower illuminated edge.
// Both phases progress in the same direction; their slightly different rates
// change the silhouette without reversing the whole field.
float ribbon(vec2 uv, float t, float depth) {
  float phase = uv.x * 5.4 - t + depth;
  float bend = sin(phase + .63 * sin(uv.x * 3.1 - .59 * t + depth));
  float shoulder = .055 * sin(uv.x * 8.4 - .8 * t + 2.4 * depth);
  float center = .52 + depth * .07 + (.17 + .11 * u_bass) * bend + shoulder;
  float width = .075 + .045 * (.5 + .5 * cos(phase)) + .04 * u_bass;
  float d = (uv.y - center) / width;
  return .59 * exp(-.55 * d * d) + .41 * exp(-4. * (d - .35) * (d - .35));
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  float first = ribbon(uv, u_time * .95, 0.);
  float second = ribbon(uv, u_time * .77, 2.8);
  float weightedSecond = second * .74;
  float light = min(first + weightedSecond, 1.);
  vec3 cover = mix(u_primary, u_secondary, weightedSecond / max(.001, first + weightedSecond));
  vec3 ink = mix(cover, vec3(1.), .12 * light);
  float alpha = light * (.46 + .22 * u_bass);
  fragColor = vec4(ink * alpha, alpha);
}
