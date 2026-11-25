#import <React/RCTBridgeModule.h>

@interface SuprConfig : NSObject <RCTBridgeModule>
@end

@implementation SuprConfig
RCT_EXPORT_MODULE(SuprConfig)
+ (BOOL)requiresMainQueueSetup { return NO; }
- (NSDictionary *)constantsToExport {
#if DEBUG
    NSString *url = [[NSBundle mainBundle] objectForInfoDictionaryKey:@"SuprDevelopmentApiURL"];
    return @{@"developmentApiUrl": [url isKindOfClass:NSString.class] ? url : @""};
#else
    BOOL isCodexValidation = [[[NSBundle mainBundle] bundleIdentifier]
        isEqualToString:@"com.spur.recordingring.codexvalidation"];
    return @{@"allowsLocalCreatorAgentHttps": @(isCodexValidation)};
#endif
}
@end
