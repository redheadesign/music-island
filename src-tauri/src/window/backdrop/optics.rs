use windows::{
    core::{Interface, Result, GUID, HSTRING, PCWSTR},
    Foundation::{IPropertyValue, PropertyValue},
    Graphics::Effects::{
        IGraphicsEffect, IGraphicsEffectSource, IGraphicsEffectSource_Impl, IGraphicsEffect_Impl,
    },
    Win32::{
        Foundation::E_INVALIDARG,
        Graphics::Direct2D::CLSID_D2D1GaussianBlur,
        System::WinRT::Graphics::Direct2D::{
            IGraphicsEffectD2D1Interop, IGraphicsEffectD2D1Interop_Impl,
            GRAPHICS_EFFECT_PROPERTY_MAPPING, GRAPHICS_EFFECT_PROPERTY_MAPPING_DIRECT,
        },
    },
    UI::Composition::{
        CompositionBackdropBrush, CompositionEffectBrush, CompositionEffectFactory,
        CompositionEffectSourceParameter, Compositor,
    },
};

#[windows_core::implement(IGraphicsEffect, IGraphicsEffectSource, IGraphicsEffectD2D1Interop)]
struct Frost {
    source: IGraphicsEffectSource,
    properties: [IPropertyValue; 3],
}

impl IGraphicsEffectSource_Impl for Frost_Impl {}

impl IGraphicsEffect_Impl for Frost_Impl {
    fn Name(&self) -> Result<HSTRING> {
        Ok(HSTRING::from("Frost"))
    }
    fn SetName(&self, _: &HSTRING) -> Result<()> {
        Err(E_INVALIDARG.into())
    }
}

impl IGraphicsEffectD2D1Interop_Impl for Frost_Impl {
    fn GetEffectId(&self) -> Result<GUID> {
        Ok(CLSID_D2D1GaussianBlur)
    }
    fn GetNamedPropertyMapping(
        &self,
        name: &PCWSTR,
        index: *mut u32,
        mapping: *mut GRAPHICS_EFFECT_PROPERTY_MAPPING,
    ) -> Result<()> {
        if index.is_null()
            || mapping.is_null()
            || name.is_null()
            || unsafe { name.as_wide() }
                .iter()
                .copied()
                .ne("Radius".encode_utf16())
        {
            return Err(E_INVALIDARG.into());
        }
        unsafe {
            *index = 0; // D2D1_GAUSSIANBLUR_PROP_STANDARD_DEVIATION
            *mapping = GRAPHICS_EFFECT_PROPERTY_MAPPING_DIRECT;
        }
        Ok(())
    }
    fn GetPropertyCount(&self) -> Result<u32> {
        Ok(self.properties.len() as u32)
    }
    fn GetProperty(&self, index: u32) -> Result<IPropertyValue> {
        self.properties
            .get(index as usize)
            .cloned()
            .ok_or(E_INVALIDARG.into())
    }
    fn GetSource(&self, index: u32) -> Result<IGraphicsEffectSource> {
        if index == 0 {
            Ok(self.source.clone())
        } else {
            Err(E_INVALIDARG.into())
        }
    }
    fn GetSourceCount(&self) -> Result<u32> {
        Ok(1)
    }
}

pub(super) fn blur_factory(compositor: &Compositor) -> Result<CompositionEffectFactory> {
    let input = CompositionEffectSourceParameter::Create(&HSTRING::from("Desktop"))?;
    let graph: IGraphicsEffect = Frost {
        source: input.cast()?,
        properties: [
            PropertyValue::CreateSingle(0.)?.cast()?,
            PropertyValue::CreateUInt32(0)?.cast()?, // D2D1_GAUSSIANBLUR_OPTIMIZATION_SPEED
            PropertyValue::CreateUInt32(1)?.cast()?, // D2D1_BORDER_MODE_HARD
        ],
    }
    .into();
    let paths: windows_collections::IIterable<HSTRING> = vec![HSTRING::from("Frost.Radius")].into();
    let factory = compositor.CreateEffectFactoryWithProperties(&graph, &paths)?;
    factory.ExtendedError()?.ok()?;
    Ok(factory)
}

pub(super) fn bind_frost(
    factory: &CompositionEffectFactory,
    backdrop: &CompositionBackdropBrush,
) -> Result<CompositionEffectBrush> {
    let brush = factory.CreateBrush()?;
    brush.SetSourceParameter(&HSTRING::from("Desktop"), backdrop)?;
    Ok(brush)
}

pub(super) fn set_radius(brush: &CompositionEffectBrush, radius: f32) -> Result<()> {
    brush
        .Properties()?
        .InsertScalar(&HSTRING::from("Frost.Radius"), radius)
}
