export const sdfVertexShader = `
  varying vec2 vUv;
  varying vec3 vViewPosition;
  varying vec3 vWorldPosition;

  void main() {
    vUv = uv;
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    vViewPosition = - (viewMatrix * worldPosition).xyz; // Camera is at 0,0,0 in view space usually
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

export const sdfFragmentShader = `
  precision highp float;
  
  uniform float u_time;
  uniform vec3 u_cameraPos;
  uniform vec3 u_color;
  
  // Blobs: x,y,z,radius
  uniform vec4 u_blobs[50]; 
  uniform int u_blobCount;

  // Limbs (Capsules): posA, posB(r)
  uniform vec3 u_capsulesA[50];
  uniform vec4 u_capsulesB[50];
  uniform int u_capsuleCount;

  uniform float u_blendStrength;
  uniform float u_limbBlendStrength; // Sharper blending for limbs
  uniform float u_noiseStrength;
  uniform float u_breath;

  // New Fidelity Uniforms
  uniform float u_skinScale; // Cell size for voronoi
  uniform float u_skinRoughness;
  uniform float u_wetness;

  varying vec3 vWorldPosition;

  // --- Noise Functions ---
  float hash(vec3 p) {
    return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
  }
  float noise(vec3 p) {
      vec3 i = floor(p); vec3 f = fract(p);
      f = f*f*(3.0-2.0*f);
      return mix(mix(mix(hash(i+vec3(0,0,0)),hash(i+vec3(1,0,0)),f.x),
                     mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
                 mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),
                     mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);
  }
  
  // Voronoi / Cellular Noise for Scales/Skin
  // Returns vec2(distToBorder, distToCenter)
  vec2 voronoi(vec3 x) {
    vec3 p = floor(x);
    vec3 f = fract(x);
    float id = 0.0;
    vec2 res = vec2(8.0);
    for(int k=-1; k<=1; k++)
    for(int j=-1; j<=1; j++)
    for(int i=-1; i<=1; i++) {
        vec3 b = vec3(float(i), float(j), float(k));
        vec3 r = vec3(b) - f + hash(p + b);
        float d = dot(r, r);
        if(d < res.x) {
            res.y = res.x;
            res.x = d;
        } else if(d < res.y) {
            res.y = d;
        }
    }
    return vec2(sqrt(res.x), sqrt(res.y));
  }

  float fbm(vec3 p) {
      float v=0.0; float a=0.5;
      for(int i=0; i<3; i++){ v+=a*noise(p); p*=2.0; a*=0.5; }
      return v;
  }

  // --- SDF Primitives ---
  float sdSphere(vec3 p, float s) { return length(p) - s; }
  float sdCapsule(vec3 p, vec3 a, vec3 b, float r) {
    vec3 pa = p - a, ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return length(pa - ba * h) - r;
  }
  float smin(float a, float b, float k) {
    float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
  }

  // --- Scene Map ---
  float map(vec3 p) {
    float d = 100.0;
    
    // Low frequency displacement (Shape Wiggle)
    float shapeWiggle = fbm(p * 0.5 + u_time * 0.2) * 0.1;
    
    // Breathing/Pulse
    vec3 pPulse = p;
    
    // Combine Spheres
    for (int i = 0; i < 50; i++) {
        if (i >= u_blobCount) break;
        float breathMod = (i < 3) ? (1.0 + u_breath * 0.08) : 1.0; 
        float dSphere = sdSphere(pPulse - u_blobs[i].xyz, u_blobs[i].w * breathMod);
        d = smin(d, dSphere, u_blendStrength);
    }
    // Combine Capsules (limbs) with SHARPER blending
    for (int i = 0; i < 50; i++) {
        if (i >= u_capsuleCount) break;
        float dCaps = sdCapsule(pPulse, u_capsulesA[i], u_capsulesB[i].xyz, u_capsulesB[i].w);
        d = smin(d, dCaps, u_limbBlendStrength); // Use separate blend for sharp limbs
    }

    return d + shapeWiggle;
  }

  vec3 calcNormal(vec3 p) {
    const float eps = 0.001;
    vec2 h = vec2(eps, 0);
    return normalize(vec3(map(p+h.xyy) - map(p-h.xyy),
                          map(p+h.yxy) - map(p-h.yxy),
                          map(p+h.yyx) - map(p-h.yyx)));
  }

  void main() {
    vec3 ro = u_cameraPos;
    vec3 rd = normalize(vWorldPosition - ro);

    float t = 0.0;
    float tmax = 50.0; // Increased render distance
    
    // Raymarching
    float d = 0.0;
    for (int i = 0; i < 128; i++) { // Increased steps for detail
      vec3 p = ro + rd * t;
      d = map(p);
      if (d < 0.001 || t > tmax) break;
      t += d * 0.8; // Slower march for stability with noise
    }

    if (t < tmax) {
      vec3 p = ro + rd * t;
      vec3 normal = calcNormal(p);
      
      // --- Procedural Skin Texture ---
      // Voronoi for scales/cells
      vec2 skin = voronoi(p * u_skinScale);
      float cellCenter = skin.x;
      float cellBorder = skin.y - skin.x; // High at border
      
      // Bump map effect based on texture
      vec3 skinNormal = normalize(normal + vec3(cellBorder * u_skinRoughness));
      
      // --- Lighting Model ---
      vec3 lightDir = normalize(vec3(0.5, 1.0, 0.5));
      vec3 viewDir = -rd;
      vec3 halfDir = normalize(lightDir + viewDir);

      // Diffuse (Lambert)
      float diff = max(dot(skinNormal, lightDir), 0.0);
      
      // Specular (Phong) - Wetness
      float specPower = mix(10.0, 100.0, u_wetness);
      float specStr = mix(0.1, 1.0, u_wetness);
      float spec = pow(max(dot(skinNormal, halfDir), 0.0), specPower) * specStr;
      
      // Subsurface Scattering Approximation (SSS)
      // Wrap lighting + thickness estimation (assumed via normal)
      float sss = pow(max(0.0, dot(lightDir, -normal)), 2.0) * 0.5; // Backlighting
      sss += smoothstep(0.0, 1.0, map(p + lightDir * 0.2)) * 0.4; // Thickness proxy (cheap)
      vec3 sssColor = vec3(1.0, 0.4, 0.2); // Fleshy red/orange
      
      // Color Composition
      vec3 baseCol = u_color;
      
      // Variation based on cells
      baseCol = mix(baseCol, baseCol * 0.8, cellCenter); // Darker centers
      baseCol = mix(baseCol, vec3(0.8, 0.2, 0.2), sss * 0.3); // Add fleshy tone
      
      // Fresnel Rim
      float rim = pow(1.0 - max(dot(viewDir, skinNormal), 0.0), 3.0);
      vec3 rimColor = mix(vec3(0.2), vec3(0.5, 0.8, 1.0), u_wetness); // Blueish rim if wet
      
      vec3 finalCol = baseCol * (diff + 0.2) + sss * sssColor * 0.3 + spec + rim * rimColor;
      
      gl_FragColor = vec4(finalCol, 1.0);
    } else {
      discard;
    }
  }
`;
