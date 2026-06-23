use crate::export::AntiDupConfig;

pub fn build_antidup_filter(
    config: &AntiDupConfig,
) -> Option<String> {
    if !config.enabled || config.level == "None" {
        return None;
    }

    let mut filter = String::new();

    // Randomize slightly based on time to make each clip truly unique
    // For simplicity, we just apply the core logic of the anti-dup levels here.
    
    match config.level.as_str() {
        "light" => {
            // Slight brightness and saturation change
            filter.push_str("eq=brightness=0.01:saturation=1.02");
        }
        "medium" => {
            // Brightness + noise
            filter.push_str("eq=brightness=0.02:saturation=1.04,noise=alls=1:allf=t+u");
        }
        "aggressive" => {
            // Brightness, noise, and subtle 2% zoom crop to alter pixel hashes entirely
            filter.push_str("crop=iw*0.98:ih*0.98,scale=iw:ih,eq=brightness=0.04:saturation=1.08,noise=alls=2:allf=t+u");
        }
        "random" => {
            // Let's use Medium for Random in this static context
            filter.push_str("eq=brightness=0.02:saturation=1.04,noise=alls=1:allf=t+u");
        }
        _ => return None,
    };

    Some(filter)
}
