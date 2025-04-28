/// The metadata of the plugin.
export interface Meta {
  /// The name of the plugin
  displayName: string //插件名称

  /// The description of the plugin
  description?: string // 插件描述

  /// The package that the plugin belongs to
  package: string //插件所在的包

  /// The group of the plugin, internal plugins will be grouped by `System`
  group?: string //插件所属的组

  /// Any additional metadata
  additional?: Record<string, any> //其它更多的信息
}
