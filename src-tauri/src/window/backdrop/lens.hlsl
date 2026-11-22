Texture2D<float4> desktop : register(t0);
SamplerState samplerLinear : register(s0);

cbuffer Glass : register(b0) {
    float2 bodySize;
    float2 cropOrigin;
    float2 inverseCropSize;
    float2 bodyOrigin; // In monitor pixels, relative to the sampled crop.
    float4 cornerRadii;
    float bend;
    float dispersion;
    float bodyMonitorTop;
    float opacity;
};

float4 vertex(uint index : SV_VertexID) : SV_POSITION {
    float2 position = float2((index << 1) & 2, index & 2);
    return float4(position.x * 2 - 1, 1 - position.y * 2, 0, 1);
}

float3 sampleDesktop(float2 p) {
    return desktop.SampleLevel(samplerLinear, (p + cropOrigin) * inverseCropSize, 0).rgb;
}

float3 spectralSample(float2 p, float2 fringe) {
    if (dispersion < .01) return sampleDesktop(p);
    return float3(sampleDesktop(p - fringe).r, sampleDesktop(p).g, sampleDesktop(p + fringe).b);
}

float4 pixel(float4 position : SV_POSITION) : SV_TARGET {
    float2 p = position.xy - bodySize * .5;
    float radius = p.y < 0
        ? (p.x < 0 ? cornerRadii.x : cornerRadii.y)
        : (p.x < 0 ? cornerRadii.w : cornerRadii.z);
    float2 inner = bodySize * .5 - radius;
    float2 q = abs(p) - inner;
    float shapeEdge = min(max(q.x, q.y), 0) + length(max(q, 0)) - radius;
    float coverage = saturate(.5 - shapeEdge);
    if (coverage <= 0) return 0;
    // Spread stronger optics over a wider bevel. Keep the falloff shallower
    // than one source pixel per screen pixel, so the mapping cannot reverse
    // along a straight edge and show the same detail twice.
    float maxBevel = min(bodySize.x, bodySize.y) * .4;
    float requiredBevel = max(min(24, maxBevel), bend * 2.1 + dispersion * 1.6);
    float bevel = min(maxBevel, requiredBevel);
    float strength = bevel / requiredBevel;

    // Continue the optical surface above the monitor. The rasterized mask
    // still ends at its original top; only the side bevels reach that edge.
    bool attached = bodyMonitorTop <= 0.;
    if (attached) q.y = p.y - inner.y;
    float2 outside = max(q, 0.);
    float arcDistance = length(outside);
    float edge = min(max(q.x, q.y), 0.) + arcDistance - radius;
    float rim = 1 - smoothstep(0, bevel, -edge);

    // Follow the rounded arc near the silhouette. Where both straight sides
    // influence the deeper bevel, blend them instead of switching abruptly
    // at the corner diagonal.
    float cornerBlend = max(1., bevel * .3);
    float horizontal = smoothstep(-cornerBlend, cornerBlend, q.x - q.y);
    float2 straight = float2(horizontal, 1. - horizontal);
    float2 arc = outside / max(.001, arcDistance);
    float2 normal = lerp(straight, arc, smoothstep(0., cornerBlend, arcDistance));
    normal *= float2(sign(p.x), attached || p.y >= 0. ? 1. : -1.);
    float2 displaced = position.xy + bodyOrigin - normal * (strength * bend * rim * rim);
    float2 fringe = normal * (strength * dispersion * rim);
    float3 color = spectralSample(displaced, fringe);
    // Compress bright content under the player while preserving its hue.
    // Reuse the sample already fetched for the lens.
    float luma = dot(color, float3(.2126, .7152, .0722));
    color *= 1. - .24 * smoothstep(.38, 1., luma);
    float alpha = opacity * coverage;
    return float4(color * alpha, alpha);
}
