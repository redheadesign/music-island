use windows::{
    core::{Interface, Result},
    Win32::{
        Foundation::E_FAIL,
        Graphics::{
            Direct2D::{Common::*, *},
            Direct3D11::*,
            Dxgi::{Common::*, IDXGIDevice, IDXGISurface},
        },
    },
};

/// Filters the captured strip before the optical shader applies refraction.
/// Keep the effect and its textures around, and update only when the pixels
/// or blur strength change. Direct2D can downsample wider kernels internally.
pub(super) struct Gaussian {
    context: ID2D1DeviceContext,
    effect: ID2D1Effect,
    output: Option<BlurOutput>,
}

struct BlurOutput {
    input: ID3D11Texture2D,
    source: ID2D1Bitmap1,
    output: ID2D1Bitmap1,
    view: ID3D11ShaderResourceView,
    filter: Option<(u64, f32)>,
}

impl Gaussian {
    pub(super) fn new(device: &ID3D11Device) -> Result<Self> {
        unsafe {
            let dxgi: IDXGIDevice = device.cast()?;
            let context = D2D1CreateDevice(&dxgi, None)?
                .CreateDeviceContext(D2D1_DEVICE_CONTEXT_OPTIONS_NONE)?;
            let effect = context.CreateEffect(&CLSID_D2D1GaussianBlur)?;
            effect.SetValue(
                D2D1_GAUSSIANBLUR_PROP_BORDER_MODE.0 as u32,
                D2D1_PROPERTY_TYPE_ENUM,
                &D2D1_BORDER_MODE_HARD.0.to_ne_bytes(),
            )?;
            effect.SetValue(
                D2D1_GAUSSIANBLUR_PROP_OPTIMIZATION.0 as u32,
                D2D1_PROPERTY_TYPE_ENUM,
                &D2D1_GAUSSIANBLUR_OPTIMIZATION_SPEED.0.to_ne_bytes(),
            )?;
            Ok(Self {
                context,
                effect,
                output: None,
            })
        }
    }

    pub(super) fn prepare(
        &mut self,
        device: &ID3D11Device,
        texture: &ID3D11Texture2D,
        revision: u64,
        sigma: f32,
    ) -> Result<ID3D11ShaderResourceView> {
        if self
            .output
            .as_ref()
            .is_none_or(|output| &output.input != texture)
        {
            self.output = Some(self.bind(device, texture)?);
        }
        let output = self.output.as_mut().ok_or(E_FAIL)?;
        if output.filter != Some((revision, sigma)) {
            unsafe {
                // The texture can be overwritten by D3D11 without changing
                // the Direct2D bitmap identity.
                self.effect.SetInput(0, &output.source, true);
                self.effect.SetValue(
                    D2D1_GAUSSIANBLUR_PROP_STANDARD_DEVIATION.0 as u32,
                    D2D1_PROPERTY_TYPE_FLOAT,
                    &sigma.to_ne_bytes(),
                )?;
                let filtered = self.effect.GetOutput()?;
                self.context.SetTarget(&output.output);
                self.context.BeginDraw();
                self.context.DrawImage(
                    &filtered,
                    None,
                    None,
                    D2D1_INTERPOLATION_MODE_LINEAR,
                    D2D1_COMPOSITE_MODE_SOURCE_COPY,
                );
                let result = self.context.EndDraw(None, None);
                self.context.SetTarget(None);
                result?;
            }
            output.filter = Some((revision, sigma));
        }
        Ok(output.view.clone())
    }

    fn bind(&self, device: &ID3D11Device, input: &ID3D11Texture2D) -> Result<BlurOutput> {
        let mut desc = D3D11_TEXTURE2D_DESC::default();
        let mut texture = None;
        let mut view = None;
        unsafe {
            input.GetDesc(&mut desc);
            desc.BindFlags |= D3D11_BIND_RENDER_TARGET.0 as u32;
            device.CreateTexture2D(&desc, None, Some(&mut texture))?;
            let texture = texture.ok_or(E_FAIL)?;
            device.CreateShaderResourceView(&texture, None, Some(&mut view))?;
            let bitmap_props = D2D1_BITMAP_PROPERTIES1 {
                pixelFormat: D2D1_PIXEL_FORMAT {
                    format: DXGI_FORMAT_B8G8R8A8_UNORM,
                    alphaMode: D2D1_ALPHA_MODE_IGNORE,
                },
                dpiX: 96.,
                dpiY: 96.,
                ..Default::default()
            };
            let input_surface: IDXGISurface = input.cast()?;
            let output_surface: IDXGISurface = texture.cast()?;
            let source = self
                .context
                .CreateBitmapFromDxgiSurface(&input_surface, Some(&bitmap_props))?;
            let target_props = D2D1_BITMAP_PROPERTIES1 {
                bitmapOptions: D2D1_BITMAP_OPTIONS_TARGET,
                ..bitmap_props
            };
            let output = self
                .context
                .CreateBitmapFromDxgiSurface(&output_surface, Some(&target_props))?;
            Ok(BlurOutput {
                input: input.clone(),
                source,
                output,
                view: view.ok_or(E_FAIL)?,
                filter: None,
            })
        }
    }
}
