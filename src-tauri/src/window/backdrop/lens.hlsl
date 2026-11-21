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
    float padding;
    float opacity;
};

float4 vertex(uint index : SV_VertexID) : SV_POSITION {
    float2 position = float2((index << 1) & 2, index & 2);
    return float4(position.x * 2 - 1, 1 - position.y * 2, 0, 1);
}

float distanceToEdge(float2 p) {
    float radius = p.y < 0
        ? (p.x < 0 ? cornerRadii.x : cornerRadii.y)
        : (p.x < 0 ? cornerRadii.w : cornerRadii.z);
    float2 q = abs(p) - (bodySize * .5 - radius);
    return min(max(q.x, q.y), 0) + length(max(q, 0)) - radius;
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
    float edge = distanceToEdge(p);
    float coverage = saturate(.5 - edge);
    if (coverage <= 0) return 0;
    // Spread stronger optics over a wider bevel. Keep the falloff shallower
    // than one source pixel per screen pixel, so the mapping cannot reverse
    // along a straight edge and show the same detail twice.
    float maxBevel = min(bodySize.x, bodySize.y) * .4;
    float requiredBevel = max(min(24, maxBevel), bend * 2.1 + dispersion * 1.6);
    float bevel = min(maxBevel, requiredBevel);
    float strength = bevel / requiredBevel;
    float rim = 1 - smoothstep(0, bevel, -edge);
    float2 normal = float2(distanceToEdge(p + float2(1, 0)) - edge,
                           distanceToEdge(p + float2(0, 1)) - edge);
    // Pull from inside at the monitor's top edge, where no image exists above.
    float2 displaced = position.xy + bodyOrigin - normal * (strength * bend * rim * rim);
    float2 fringe = normal * (strength * dispersion * rim);
    float3 color = spectralSample(displaced, fringe);
    float alpha = opacity * coverage;
    return float4(color * alpha, alpha);
}
